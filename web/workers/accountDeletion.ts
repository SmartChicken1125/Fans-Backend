import { Container } from "async-injection";
import { Logger } from "pino";
import BullMQService from "../../common/service/BullMQService.js";
import PrismaService from "../../common/service/PrismaService.js";
import { LanguageType, UploadUsageType } from "@prisma/client";
import SessionManagerService from "../../common/service/SessionManagerService.js";
import { deleteUploadFromCDN } from "../utils/UploadUtils.js";
import CloudflareStreamService from "../../common/service/CloudflareStreamService.js";
import MediaUploadService from "../../common/service/MediaUploadService.js";
import * as Sentry from "@sentry/node";

export default async function accountDeletionWorker(container: Container) {
	const bullMQService = await container.resolve(BullMQService);
	const logger = await container.resolve<Logger>("logger");
	const prisma = await container.resolve(PrismaService);
	const sessionManager = await container.resolve(SessionManagerService);
	const cloudflareStream = await container.resolve(CloudflareStreamService);
	const mediaUpload = await container.resolve(MediaUploadService);

	interface PostDeletionQueueData {
		userId: bigint;
		type: "post";
		entityId: bigint;
	}

	const postDeletionQueue =
		bullMQService.createQueue<PostDeletionQueueData>("PostDeletion");

	const logError = (e: unknown) => {
		logger.error(e);
		Sentry.captureException(e);
	};

	bullMQService.createWorker<{ userId: bigint }, undefined>(
		"AccountDeletion",
		async (job) => {
			const userId = job.data.userId;
			if (!userId) {
				logger.error("Invalid userId", job.data);
				return;
			}

			logger.info(`Starting deletion for user ${userId}`);
			const user = await prisma.user.findUnique({
				where: { id: userId },
			});
			if (!user) {
				logger.error(`User ${userId} not found`);
				return;
			}

			const deletedUsername = (() => {
				const buf = Buffer.alloc(8);
				buf.writeBigInt64LE(userId);
				return `DeletedUser${buf.toString("base64url")}`;
			})();

			sessionManager.destroySessionsForUser(userId.toString());

			// We need references to User and Profile objects because certain types of objects
			// we must persist for legal reasons (such as transaction logs) reference them.

			// Hence instead of simply deleting them, we anonymize them and delete as much as possible.

			await prisma.user.update({
				where: { id: userId },
				data: {
					username: deletedUsername,
					displayName: deletedUsername,
					phonenumber: null,
					email: `${userId}@deleted.fyp.fans`,
					password: "",
					avatar: null,
					country: null,
					language: LanguageType.English,
					gender: null,
					birthdate: null,
					disabled: true,
					isShowProfile: false,
					verifiedAt: null,
					isOlderThan18: false,
				},
			});

			await prisma.profile.update({
				where: { userId },
				data: {
					displayName: deletedUsername,
					profileLink: deletedUsername,
					verified: false,
					disabled: true,
					flags: 0,
					bio: "",
					avatar: null,
					cover: [],
					platformFee: 0,
					isNSFW: false,
					migrationLink: null,
					location: null,
					birthday: null,
					likeCount: 0,
					commentCount: 0,
					showProfile: false,
				},
			});

			const posts = await prisma.post.findMany({
				where: { id: userId, isPaidPost: false },
				select: { id: true },
			});
			posts.forEach((post) =>
				postDeletionQueue.add("post", {
					userId,
					type: "post",
					entityId: post.id,
				}),
			);
		},
	);

	bullMQService.createWorker<PostDeletionQueueData>(
		"PostDeletion",
		async (job) => {
			const { userId, entityId, type } = job.data;
			if (!userId || !entityId) {
				logger.error("Invalid userId or entityId", job.data);
				return;
			}

			logger.info(
				`Deleting ${type} ${entityId} created by user ${userId}`,
			);
			if (type === "post") {
				const post = await prisma.post.findUnique({
					where: { id: entityId, profile: { userId } },
					include: {
						postMedias: { include: { upload: true } },
						thumbMedia: true,
					},
				});
				if (!post) {
					logger.error(
						`Post ${entityId} not found for user ${userId}`,
					);
					return;
				}
				if (post.isPaidPost) {
					logger.warn(`Post ${entityId} is a paid post, skipping`);
					return;
				}

				logger.info(`Deleting post ${entityId}`);
				for (const pm of post.postMedias) {
					if (pm.upload) {
						logger.info(`Deleting upload ${pm.upload.id}`);
						prisma.upload.delete({ where: { id: pm.upload.id } });
						await deleteUploadFromCDN(
							pm.upload,
							cloudflareStream,
							mediaUpload,
							logger,
						);
					}
				}
				if (post.thumbMedia) {
					logger.info(`Deleting upload ${post.thumbMedia.id}`);
					prisma.upload.delete({ where: { id: post.thumbMedia.id } });
					await deleteUploadFromCDN(
						post.thumbMedia,
						cloudflareStream,
						mediaUpload,
						logger,
					);
				}
				prisma.post.delete({ where: { id: post.id } }).catch(logError);
			}
		},
	);
}
