import { Logger } from "pino";
import { Upload, UploadType, UploadUsageType } from "@prisma/client";
import { FastifyTypebox } from "../../../types.js";
import SessionManagerService, {
	Session,
} from "../../../../common/service/SessionManagerService.js";
import PrismaService from "../../../../common/service/PrismaService.js";
import APIErrors from "../../../errors/index.js";
import CloudflareStreamService from "../../../../common/service/CloudflareStreamService.js";
import MediaUploadService from "../../../../common/service/MediaUploadService.js";
import { CreateCustomVideoUploadBodyValidator } from "../orders/validation.js";
import { IMediaVideoUpload } from "../../../CommonAPISchemas.js";
import { ModelConverter } from "../../../models/modelConverter.js";
import { CreateCustomVideoUploadBody } from "../orders/schemas.js";
import {
	CameoPreviewUploadParams,
	CameoSettings,
	UpdateCameoSettings,
} from "./schemas.js";
import {
	CameoPreviewUploadParamsValidator,
	UpdateCameoPreferencesValidator,
} from "./validation.js";

export default async function routes(fastify: FastifyTypebox) {
	const { container } = fastify;

	const logger = await container.resolve<Logger>("logger");
	const sessionManager = await container.resolve(SessionManagerService);
	const prisma = await container.resolve(PrismaService);
	const cloudflareStream = await container.resolve(CloudflareStreamService);
	const mediaService = await container.resolve(MediaUploadService);

	fastify.patch<{
		Body: UpdateCameoSettings;
		Reply: UpdateCameoSettings;
	}>(
		"/",
		{
			schema: {
				body: UpdateCameoPreferencesValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session as Session;
			const creator = (await session.getProfile(prisma))!;

			const {
				volumeLimit,
				fulfillmentTime,
				description,
				sexualContentEnabled,
				contentTypes,
				customContentType,
				agreedToTerms,
				notificationNewRequests,
				notificationPendingVideos,
				notificationCancelledVideos,
				notificationCompletedRequests,
				notificationsByEmail,
				notificationsByPhone,
				customVideoEnabled,
				showReviews,
				progress,
			} = request.body;

			await prisma.customVideoSettings.update({
				where: { profileId: creator.id },
				data: {
					...(volumeLimit
						? {
								volumeTimeUnit: volumeLimit.unit,
								volumeLimit: volumeLimit.amount,
						  }
						: {}),
					...(fulfillmentTime ? { fulfillmentTime } : {}),
					...(description ? { description } : {}),
					...(sexualContentEnabled !== undefined
						? { sexualContentEnabled }
						: {}),
					...(contentTypes ? { contentTypes } : {}),
					...(customContentType ? { customContentType } : {}),
					...(agreedToTerms !== undefined ? { agreedToTerms } : {}),
					...(notificationNewRequests !== undefined
						? { notificationNewRequests }
						: {}),
					...(notificationPendingVideos !== undefined
						? { notificationPendingVideos }
						: {}),
					...(notificationCancelledVideos !== undefined
						? { notificationCancelledVideos }
						: {}),
					...(notificationCompletedRequests !== undefined
						? { notificationCompletedRequests }
						: {}),
					...(notificationsByEmail !== undefined
						? { notificationsByEmail }
						: {}),
					...(notificationsByPhone !== undefined
						? { notificationsByPhone }
						: {}),
					...(customVideoEnabled !== undefined
						? { customVideoEnabled }
						: {}),
					...(showReviews !== undefined ? { showReviews } : {}),
					...(progress !== undefined ? { progress } : {}),
				},
			});

			return reply.send(request.body);
		},
	);

	fastify.get<{ Reply: CameoSettings }>(
		"/",
		{
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session as Session;
			const creator = (await session.getProfile(prisma))!;
			const settings = await prisma.customVideoSettings.findFirst({
				where: { profileId: creator.id },
			});
			if (!settings) {
				return reply.sendError(APIErrors.CAMEO_SETTINGS_NOT_FOUND);
			}

			return reply.send({
				volumeLimit: {
					amount: settings.volumeLimit,
					unit: settings.volumeTimeUnit,
				},
				fulfillmentTime: settings.fulfillmentTime,
				description: settings.description || "",
				sexualContentEnabled: settings.sexualContentEnabled,
				contentTypes: settings.contentTypes,
				customContentType: settings.customContentType || "",
				agreedToTerms: settings.agreedToTerms,
				notificationNewRequests: settings.notificationNewRequests,
				notificationPendingVideos: settings.notificationPendingVideos,
				notificationCancelledVideos:
					settings.notificationCancelledVideos,
				notificationCompletedRequests:
					settings.notificationCompletedRequests,
				notificationsByEmail: settings.notificationsByEmail,
				notificationsByPhone: settings.notificationsByPhone,
				customVideoEnabled: settings.customVideoEnabled,
				showReviews: settings.showReviews,
				progress: settings.progress,
			});
		},
	);

	fastify.post<{
		Body: CreateCustomVideoUploadBody;
	}>(
		"/previews",
		{
			schema: {
				body: CreateCustomVideoUploadBodyValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session as Session;
			const profile = await session.getProfile(prisma);
			if (!profile) {
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}
			const { uploadId } = request.body;

			const upload = await prisma.upload.findFirst({
				where: { id: BigInt(uploadId) },
				select: { id: true, userId: true, usage: true, type: true },
			});
			if (!upload || upload.userId !== BigInt(session.userId)) {
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}
			if (upload.usage !== UploadUsageType.CUSTOM_VIDEO_PREVIEW) {
				return reply.sendError(APIErrors.UPLOAD_INVALID_USAGE);
			}
			if (upload.type !== UploadType.Video) {
				return reply.sendError(
					APIErrors.UPLOAD_INVALID_TYPE(
						"This method only accepts Video uploads.",
					),
				);
			}

			await prisma.customVideoPreviewUpload.create({
				data: { uploadId: upload.id, profileId: profile.id },
			});

			return reply.send({
				uploadId,
			});
		},
	);

	fastify.get<{
		Params: CameoPreviewUploadParams;
		Reply: IMediaVideoUpload;
	}>(
		"/previews/:uploadId",
		{
			schema: {
				params: CameoPreviewUploadParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session as Session;
			const profile = await session.getProfile(prisma);
			if (!profile) {
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}
			const { uploadId } = request.params;

			const upload = await prisma.customVideoPreviewUpload.findFirst({
				where: {
					profileId: profile.id,
					uploadId: BigInt(uploadId),
				},
				include: { upload: true },
			});
			if (!upload) {
				return reply.sendError(APIErrors.ITEM_NOT_FOUND("Upload"));
			}

			const result = await ModelConverter.toIMediaVideoUpload(
				cloudflareStream,
				mediaService,
			)(upload.upload);

			return reply.send(result);
		},
	);

	fastify.get<{
		Reply: { results: IMediaVideoUpload[] };
	}>(
		"/previews",
		{
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session as Session;
			const profile = await session.getProfile(prisma);
			if (!profile) {
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}

			const uploads = await prisma.customVideoPreviewUpload.findMany({
				where: { profileId: profile.id },
				include: { upload: true },
			});

			const results = await Promise.all(
				uploads.map((upload) =>
					ModelConverter.toIMediaVideoUpload(
						cloudflareStream,
						mediaService,
					)(upload.upload),
				),
			);

			return reply.send({
				results,
			});
		},
	);

	fastify.delete<{
		Params: CameoPreviewUploadParams;
	}>(
		"/previews/:uploadId",
		{
			schema: {
				params: CameoPreviewUploadParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session as Session;
			const profile = await session.getProfile(prisma);
			if (!profile) {
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}
			const { uploadId } = request.params;

			await prisma.customVideoPreviewUpload.delete({
				where: {
					profileId_uploadId: {
						profileId: profile.id,
						uploadId: BigInt(uploadId),
					},
				},
			});

			return reply.send({
				uploadId,
			});
		},
	);
}
