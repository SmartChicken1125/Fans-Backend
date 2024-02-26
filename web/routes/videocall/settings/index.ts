import { Logger } from "pino";
import { DateTime } from "luxon";
import { Profile, UploadType, UploadUsageType } from "@prisma/client";
import { FastifyTypebox } from "../../../types.js";
import SessionManagerService, {
	Session,
} from "../../../../common/service/SessionManagerService.js";
import PrismaService from "../../../../common/service/PrismaService.js";
import APIErrors from "../../../errors/index.js";
import CloudflareStreamService from "../../../../common/service/CloudflareStreamService.js";
import { CreateCustomVideoUploadBody } from "../../cameo/orders/schemas.js";
import { CreateCustomVideoUploadBodyValidator } from "../../cameo/orders/validation.js";
import { CameoPreviewUploadParams } from "../../cameo/settings/schemas.js";
import { IMediaVideoUpload } from "../../../CommonAPISchemas.js";
import { CameoPreviewUploadParamsValidator } from "../../cameo/settings/validation.js";
import { ModelConverter } from "../../../models/modelConverter.js";
import MediaUploadService from "../../../../common/service/MediaUploadService.js";
import { UpdateVideoCallSettingsValidator } from "./validation.js";
import { UpdateVideoCallSettings, VideoCallSettingsReply } from "./schema.js";

export default async function routes(fastify: FastifyTypebox) {
	const { container } = fastify;

	const logger = await container.resolve<Logger>("logger");
	const sessionManager = await container.resolve(SessionManagerService);
	const prisma = await container.resolve(PrismaService);
	const cloudflareStream = await container.resolve(CloudflareStreamService);
	const mediaService = await container.resolve(MediaUploadService);

	fastify.patch<{
		Body: UpdateVideoCallSettings;
		Reply: UpdateVideoCallSettings;
	}>(
		"/",
		{
			schema: {
				body: UpdateVideoCallSettingsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session as Session;
			const profile = (await session.getProfile(prisma)) as Profile;

			const {
				bufferBetweenCalls,
				meetingType,
				sexualContentAllowed,
				contentPreferences,
				customContentPreferences,
				meetingTitle,
				meetingDescription,
				notificationNewRequests,
				notificationCancellations,
				notificationReminders,
				notificationsByEmail,
				notificationsByPhone,
				videoCallsEnabled,
				progress,
				timezone,
				vacationsEnabled,
			} = request.body;

			if (timezone) {
				const tzOffset = DateTime.now().setZone(timezone).offset;
				if (Number.isNaN(tzOffset)) {
					return reply.sendError(
						APIErrors.INVALID_REQUEST("Invalid timezone"),
					);
				}
			}

			const updatedProfile = await prisma.meetingSettings.update({
				where: { profileId: profile.id },
				data: {
					...(meetingType ? { meetingType } : {}),
					...(bufferBetweenCalls ? { bufferBetweenCalls } : {}),
					...(sexualContentAllowed !== undefined
						? { sexualContentAllowed }
						: {}),
					...(contentPreferences !== undefined
						? { contentPreferences }
						: {}),
					...(customContentPreferences !== undefined
						? { customContentPreferences }
						: {}),
					...(meetingTitle !== undefined
						? { title: meetingTitle }
						: {}),
					...(meetingDescription !== undefined
						? { description: meetingDescription }
						: {}),
					...(notificationNewRequests !== undefined
						? { notificationNewRequests }
						: {}),
					...(notificationCancellations !== undefined
						? { notificationCancellations }
						: {}),
					...(notificationReminders !== undefined
						? { notificationReminders }
						: {}),
					...(notificationsByEmail !== undefined
						? { notificationsByEmail }
						: {}),
					...(notificationsByPhone !== undefined
						? { notificationsByPhone }
						: {}),
					...(videoCallsEnabled !== undefined
						? { videoCallsEnabled }
						: {}),
					...(progress !== undefined ? { progress } : {}),
					...(timezone !== undefined ? { timezone } : {}),
					...(vacationsEnabled !== undefined
						? { vacationsEnabled }
						: {}),
				},
			});

			return reply.send(request.body);
		},
	);

	fastify.get<{ Reply: VideoCallSettingsReply }>(
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
			const settings = await prisma.meetingSettings.findFirst({
				where: { profileId: creator.id },
			});
			if (!settings) {
				return reply.sendError(APIErrors.MEETING_SETTINGS_NOT_FOUND);
			}

			return reply.send({
				bufferBetweenCalls: settings.bufferBetweenCalls,
				meetingType: settings.meetingType,
				sexualContentAllowed: settings.sexualContentAllowed,
				contentPreferences: settings.contentPreferences,
				customContentPreferences:
					settings.customContentPreferences || "",
				meetingTitle: settings.title || "",
				meetingDescription: settings.description || "",
				notificationNewRequests: settings.notificationNewRequests,
				notificationCancellations: settings.notificationCancellations,
				notificationReminders: settings.notificationReminders,
				notificationsByEmail: settings.notificationsByEmail,
				notificationsByPhone: settings.notificationsByPhone,
				videoCallsEnabled: settings.videoCallsEnabled,
				progress: settings.progress,
				timezone: settings.timezone || undefined,
				vacationsEnabled: settings.vacationsEnabled,
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
			if (upload.usage !== UploadUsageType.VIDEO_CALL_PREVIEW) {
				return reply.sendError(APIErrors.UPLOAD_INVALID_USAGE);
			}
			if (upload.type !== UploadType.Video) {
				return reply.sendError(
					APIErrors.UPLOAD_INVALID_TYPE(
						"This method only accepts Video uploads.",
					),
				);
			}

			await prisma.meetingPreviewUpload.create({
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

			const upload = await prisma.meetingPreviewUpload.findFirst({
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

			const uploads = await prisma.meetingPreviewUpload.findMany({
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

			await prisma.meetingPreviewUpload.delete({
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
