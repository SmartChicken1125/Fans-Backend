import { Logger } from "pino";
import { Profile } from "@prisma/client";
import { FastifyTypebox } from "../../../types.js";
import SessionManagerService, {
	Session,
} from "../../../../common/service/SessionManagerService.js";
import PrismaService from "../../../../common/service/PrismaService.js";
import APIErrors from "../../../errors/index.js";
import CloudflareStreamService from "../../../../common/service/CloudflareStreamService.js";
import { UpdateVideoCallSettingsValidator } from "./validation.js";
import {
	UpdateVideoCallSettings,
	VideoCallSettings,
	VideoCallSettingsReply,
} from "./schema.js";
import { firstParam } from "../../../../common/utils/Common.js";

export default async function routes(fastify: FastifyTypebox) {
	const { container } = fastify;

	const logger = await container.resolve<Logger>("logger");
	const sessionManager = await container.resolve(SessionManagerService);
	const prisma = await container.resolve(PrismaService);
	const cloudflareStream = await container.resolve(CloudflareStreamService);

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
			} = request.body;

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
				},
			});

			return reply.send(request.body);
		},
	);

	fastify.post(
		"/video-preview/tus",
		{
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session as Session;
			const profile = (await session.getProfile(prisma)) as Profile;

			const uploadLength = firstParam(request.headers["upload-length"]);
			if (!uploadLength) {
				return reply.sendError(
					APIErrors.INVALID_REQUEST(
						"Upload-Length header must be set.",
					),
				);
			}

			const upload = await cloudflareStream.createTusUpload(
				BigInt(session.userId),
				uploadLength,
			);

			await prisma.meetingSettings.update({
				where: { profileId: profile.id },
				data: { videoPreviewStreamId: upload.streamMediaId },
			});

			const signedUrl = cloudflareStream.getSignedVideoUrl(
				upload.streamMediaId,
			);

			return reply.send({
				url: signedUrl,
				uploadUrl: upload.uploadUrl,
			});
		},
	);

	fastify.delete(
		"/video-preview",
		{
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session as Session;
			const profile = (await session.getProfile(prisma)) as Profile;

			const settings = await prisma.meetingSettings.findFirst({
				where: { profileId: profile.id },
			});
			if (!settings) {
				return reply.sendError(APIErrors.MEETING_SETTINGS_NOT_FOUND);
			}

			if (settings.videoPreviewStreamId) {
				await cloudflareStream.deleteVideo(
					settings.videoPreviewStreamId,
				);
			}
			await prisma.meetingSettings.update({
				where: { profileId: profile.id },
				data: { videoPreviewStreamId: null },
			});

			return reply.status(200).send();
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

			const videoPreview =
				(settings.videoPreviewStreamId &&
					cloudflareStream.getSignedVideoUrl(
						settings.videoPreviewStreamId,
					)) ||
				undefined;

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
				videoPreview,
			});
		},
	);
}
