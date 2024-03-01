import dinero from "dinero.js";
import { DateTime } from "luxon";
import {
	SubscriptionStatus,
	UploadType,
	VideoCallStatus,
	TransactionStatus,
} from "@prisma/client";
import { DEFAULT_PAGE_SIZE, isOutOfRange } from "../../../common/pagination.js";
import CloudflareStreamService from "../../../common/service/CloudflareStreamService.js";
import InboxManagerService, {
	IMessageCreateOptions,
	MessageWithUser,
} from "../../../common/service/InboxManagerService.js";
import MediaUploadService from "../../../common/service/MediaUploadService.js";
import PrismaService from "../../../common/service/PrismaService.js";
import RPCManagerService from "../../../common/service/RPCManagerService.js";
import SessionManagerService from "../../../common/service/SessionManagerService.js";
import SnowflakeService from "../../../common/service/SnowflakeService.js";
import { MeetingService } from "../../../common/service/MeetingService.js";
import { IMessage, IVideoCall, MessageType } from "../../CommonAPISchemas.js";
import APIErrors from "../../errors/index.js";
import { ModelConverter } from "../../models/modelConverter.js";
import { FastifyTypebox } from "../../types.js";
import { resolveURLsUploads } from "../../utils/UploadUtils.js";
import {
	ChannelMediaPageQuery,
	ChatAutomatedMessageWelcomeReqBody,
	ChatConversationByUserRespBody,
	ChatConversationMessagesPostReqBody,
	ChatConversationMessagesQuery,
	ChatConversationMessagesRespBody,
	ChatConversationRespBody,
	ChatDeleteMessageId,
	ChatFansListReqParams,
	ChatFansListRespBody,
	ChatIdParams,
	ChatNoteReqBody,
	ChatPaidPostPriceReqQuery,
	ChatUserIdParams,
	ChatWSInfoRespBody,
	CreateMessageReportReqBody,
	MediasRespBody,
	PurchaseChatPaidPostReqBody,
	UpdateChatAutomatedMessageWelcomeReqBody,
} from "./schemas.js";
import {
	ChannelMediaPageQueryValidator,
	ChatAutomatedMessageWelcomeReqBodyValidator,
	ChatConversationMessagesPostReqBodyValidator,
	ChatConversationMessagesQueryValidator,
	ChatDeleteMessageIdValidator,
	ChatFansListReqParamsValidator,
	ChatIdParamsValidator,
	ChatNoteReqBodyValidator,
	ChatPaidPostPriceReqQueryValidator,
	ChatUserIdParamsValidator,
	CreateMessageReportReqBodyValidator,
	PurchaseChatPaidPostReqBodyValidator,
	UpdateChatAutomatedMessageWelcomeReqBodyValidator,
} from "./validation.js";
import AuthorizeNetService from "../../../common/service/AuthorizeNetService.js";
import FeesCalculator from "../../../common/service/FeesCalculatorService.js";
import SiftService from "../../../common/service/SiftService.js";
import { GetChimeReply } from "../videocall/meetings/schemas.js";
import { TaxjarError } from "taxjar/dist/util/types.js";
import { setInterval } from "node:timers/promises";

const DECIMAL_TO_CENT_FACTOR = 100;

export default async function routes(fastify: FastifyTypebox) {
	const { container } = fastify;

	const prisma = await container.resolve(PrismaService);
	const snowflake = await container.resolve(SnowflakeService);
	const sessionManager = await container.resolve(SessionManagerService);
	const authorizeNetService = await container.resolve(AuthorizeNetService);
	const feesCalculator = await container.resolve(FeesCalculator);
	const siftService = await container.resolve(SiftService);
	const rpc = await container.resolve(RPCManagerService);
	const inboxManager = await container.resolve(InboxManagerService);
	const cloudflareStream = await container.resolve(CloudflareStreamService);
	const mediaUpload = await container.resolve(MediaUploadService);
	const meetingService = await container.resolve(MeetingService);
	const maxObjectLimit = parseInt(process.env.MAX_OBJECT_LIMIT ?? "100");

	const chatWebSocketURL = process.env.PUBLIC_CHAT_WS_URL;

	if (!chatWebSocketURL) {
		throw new Error("Missing PUBLIC_CHAT_WS_URL environment variable");
	}

	fastify.get<{
		Reply: ChatWSInfoRespBody;
	}>("/ws-info", async (request, reply) => {
		return reply.send({
			webSocketUrl: chatWebSocketURL,
		});
	});

	// Gets a list of conversations
	fastify.get<{
		Reply: ChatConversationRespBody;
	}>(
		"/conversations",
		{
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);

			const inboxes = await prisma.messageChannelInbox.findMany({
				where: { userId: user.id },
				include: {
					channel: true,
				},
			});

			const conversations = await Promise.all(
				inboxes.map((inbox) => inboxManager.getConversationMeta(inbox)),
			);

			reply.send({
				conversations,
			});
		},
	);

	// Gets or creates a direct conversation with an user
	fastify.post<{
		Params: ChatUserIdParams;
		Reply: ChatConversationByUserRespBody;
	}>(
		"/conversations/users/:userId",
		{
			schema: {
				params: ChatUserIdParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);

			const senderId = user.id;
			const recipientId = BigInt(request.params.userId);

			const { meta } = await inboxManager.getOrCreateConversation(
				senderId,
				recipientId,
			);

			reply.send(meta);
		},
	);

	// Gets messages from a conversation
	fastify.get<{
		Params: ChatIdParams;
		Querystring: ChatConversationMessagesQuery;
	}>(
		"/conversations/:id/messages",
		{
			schema: {
				params: ChatIdParamsValidator,
				querystring: ChatConversationMessagesQueryValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);

			if (
				typeof request.query.after === "string" &&
				typeof request.query.before === "string"
			) {
				return reply.sendError(
					APIErrors.INVALID_REQUEST(
						"'before' and 'after' are mutually exclusive",
					),
				);
			}

			const channelId = BigInt(request.params.id);

			const channel = await prisma.messageChannel.findFirst({
				where: {
					id: channelId,
					participants: {
						some: { userId: user.id },
					},
				},
			});

			if (!channel) {
				return reply.sendError(APIErrors.CHANNEL_NOT_FOUND);
			}

			const idBefore: bigint | undefined = request.query.before
				? BigInt(request.query.before)
				: undefined;
			const idAfter: bigint | undefined = request.query.after
				? BigInt(request.query.after)
				: undefined;

			const messages = await prisma.message
				.findMany({
					include: {
						uploads: true,
						parentMessage: true,
					},
					where: {
						channelId,
						...(idBefore
							? { id: { lt: idBefore } }
							: { id: { gt: idAfter } }),
						deletedAt: null,
					},
					orderBy: {
						id: idAfter ? "asc" : "desc",
					},
					take: request.query.limit,
				})
				.then((u) => inboxManager.resolveUsers(u));
			const allUploads = messages.flatMap((m) => m.uploads ?? []);

			await resolveURLsUploads(allUploads, cloudflareStream, mediaUpload);

			messages.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

			const getMetadata = (m: MessageWithUser) => ({
				isSelf: m.userId === user.id,
				isPaidPost: false, // todo(alexandra)
				isPaidFor: false,
			});

			reply.send({
				messages: messages.map((m) =>
					ModelConverter.toIMessage(m, getMetadata(m)),
				),
			} as ChatConversationMessagesRespBody);
		},
	);

	const validMessageTypes = [
		MessageType.TEXT,
		MessageType.MEDIA,
		MessageType.GIF,
		MessageType.PAID_POST,
		MessageType.VIDEO_CALL_NOTIFICATION,
		MessageType.TOP_FAN_NOTIFICATION,
	];

	// Sends a message to a conversation
	fastify.post<{
		Params: ChatIdParams;
		Body: ChatConversationMessagesPostReqBody;
		Reply: IMessage;
	}>(
		"/conversations/:id/messages",
		{
			schema: {
				params: ChatIdParamsValidator,
				body: ChatConversationMessagesPostReqBodyValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);
			const channelId = BigInt(request.params.id);

			const messageType = request.body.messageType ?? MessageType.TEXT;
			if (!validMessageTypes.includes(messageType)) {
				return reply.sendError(
					APIErrors.INVALID_REQUEST("Invalid message type"),
				);
			}

			const channel = await inboxManager.getChannelParticipants(
				channelId,
				user.id,
			);
			if (!channel) {
				return reply.sendError(APIErrors.CHANNEL_NOT_FOUND);
			}

			let options: IMessageCreateOptions;

			if (messageType === MessageType.TEXT) {
				options = {
					channelId,
					userId: user.id,
					content: request.body.content,
					messageType,
					parentId: request.body.parentId,
				};
			} else if (messageType === MessageType.MEDIA) {
				options = {
					channelId,
					userId: user.id,
					messageType,
					uploadIds:
						request.body.uploadIds?.map((s) => BigInt(s)) ?? [],
					parentId: request.body.parentId,
				};
			} else if (messageType === MessageType.GIF) {
				if (!request.body.gif) {
					return reply.sendError(
						APIErrors.INVALID_REQUEST("Missing 'gif' payload"),
					);
				}

				options = {
					channelId,
					userId: user.id,
					messageType,
					gif: request.body.gif,
					parentId: request.body.parentId,
				};
			} else if (messageType === MessageType.PAID_POST) {
				if (!request.body.value) {
					return reply.sendError(
						APIErrors.INVALID_REQUEST("Missing 'value' payload"),
					);
				}

				options = {
					channelId,
					userId: user.id,
					messageType,
					value: dinero({
						amount: Math.round(
							parseFloat(request.body.value) *
								DECIMAL_TO_CENT_FACTOR,
						),
					}).getAmount(),
					content: request.body.content,
					uploadIds:
						request.body.uploadIds?.map((s) => BigInt(s)) ?? [],
					previewUploadIds:
						request.body.previewUploadIds?.map((s) => BigInt(s)) ??
						[],
					status: TransactionStatus.Submitted,
					parentId: request.body.parentId,
				};
			} else {
				return reply.sendError(
					APIErrors.INVALID_REQUEST("Invalid message type"),
				);
			}

			const { payload } = await inboxManager.createMessage(options);

			reply.send(payload);
		},
	);

	// Start video call in a conversation
	fastify.post<{
		Params: ChatIdParams;
		Reply: IVideoCall;
	}>(
		"/conversations/:id/calls",
		{
			schema: {
				params: ChatIdParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);
			const channelId = BigInt(request.params.id);

			const channel = await inboxManager.getChannelParticipants(
				channelId,
				user.id,
			);
			if (!channel) {
				return reply.sendError(APIErrors.CHANNEL_NOT_FOUND);
			}

			const existingCall = await prisma.videoCall.findFirst({
				where: {
					messageChannelId: BigInt(channelId),
					status: VideoCallStatus.Started,
				},
			});
			if (existingCall) {
				return reply.sendError(APIErrors.VIDEO_CALL_IN_PROGRESS);
			}

			const participantIds = channel.participants.map(
				(participant) => participant.userId,
			);
			const call = await meetingService.createVideoCall(
				channelId,
				participantIds,
			);
			if (!call) {
				return reply.sendError(APIErrors.VIDEO_CALL_INTERNAL_ERROR);
			}

			const scheduledEndDate = DateTime.now()
				.plus({ hour: 1 })
				.toJSDate();
			await meetingService.scheduleEndVideoCall(
				call.id,
				scheduledEndDate,
			);

			return reply.send(ModelConverter.toIVideoCall(call));
		},
	);

	// Get current call in the conversation
	fastify.get<{
		Params: ChatIdParams;
		Reply: IVideoCall;
	}>(
		"/conversations/:id/ongoing-call",
		{
			schema: {
				params: ChatIdParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);
			const channelId = BigInt(request.params.id);

			const channel = await inboxManager.getChannelParticipants(
				channelId,
				user.id,
			);
			if (!channel) {
				return reply.sendError(APIErrors.CHANNEL_NOT_FOUND);
			}

			const existingCall = await prisma.videoCall.findFirst({
				where: {
					messageChannelId: BigInt(channelId),
					status: VideoCallStatus.Started,
				},
			});
			if (!existingCall) {
				return reply.send(undefined);
			}

			return reply.send(ModelConverter.toIVideoCall(existingCall));
		},
	);

	// Get current call in the conversation
	fastify.get<{
		Params: ChatIdParams;
		Reply: GetChimeReply;
	}>(
		"/conversations/:id/ongoing-call/session-configuration",
		{
			schema: {
				params: ChatIdParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);
			const channelId = BigInt(request.params.id);

			const channel = await inboxManager.getChannelParticipants(
				channelId,
				user.id,
			);
			if (!channel) {
				return reply.sendError(APIErrors.CHANNEL_NOT_FOUND);
			}

			const existingCall = await prisma.videoCall.findFirst({
				where: {
					messageChannelId: BigInt(channelId),
					status: VideoCallStatus.Started,
				},
				include: { participants: true },
			});
			if (!existingCall) {
				return reply.sendError(APIErrors.ITEM_NOT_FOUND("Video call"));
			}

			const participant = await prisma.videoCallParticipant.findFirst({
				where: { userId: user.id, videoCallId: existingCall.id },
			});
			if (!participant) {
				return reply.sendError(
					APIErrors.ITEM_NOT_FOUND("Video call participant"),
				);
			}

			const meeting = await meetingService.getChimeMeeting(existingCall);
			const attendee = await meetingService.getChimeAttendee(
				existingCall,
				participant,
			);

			return reply.send({
				Meeting: meeting?.Meeting,
				Attendee: attendee?.Attendee,
			});
		},
	);

	// Deletes a message
	fastify.delete<{
		Params: ChatIdParams;
		Body: ChatDeleteMessageId;
	}>(
		"/conversations/:id/messages",
		{
			schema: {
				params: ChatIdParamsValidator,
				body: ChatDeleteMessageIdValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);
			const channelId = BigInt(request.params.id);
			const messageId = BigInt(request.body.messageId);

			const channel = await inboxManager.getChannelParticipants(
				channelId,
				user.id,
			);
			if (!channel) {
				return reply.sendError(APIErrors.CHANNEL_NOT_FOUND);
			}

			await inboxManager.deleteMessage(channelId, messageId, user.id);
			reply.status(201).send();
		},
	);

	fastify.get<{
		Params: ChatFansListReqParams;
		Reply: ChatFansListRespBody;
	}>(
		"/fans-list/:category/:limit",
		{
			schema: {
				params: ChatFansListReqParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const profile = await session.getProfile(prisma);

			if (!profile) {
				return reply.sendError(APIErrors.PROFILE_NOT_FOUND);
			}

			const limit = request.params.limit;

			const categories = [
				"Individual fans",
				"All fans",
				"Cancelled",
				"Tips Given",
			];

			const categoryIndex = request.params.category;
			const category = categories[categoryIndex];

			if (!category) {
				return reply.sendError(
					APIErrors.INVALID_REQUEST("Invalid category"),
				);
			}

			const getFans = async (
				creatorId: bigint,
				status?: SubscriptionStatus,
			) => {
				interface Filter {
					creatorId: bigint;
					status?: SubscriptionStatus;
					OR?: Array<
						| {
								status: SubscriptionStatus;
						  }
						| {
								endDate: {
									gte: Date;
								};
						  }
					>;
				}

				const filter = { creatorId } as Filter;
				if (status) {
					if (status === SubscriptionStatus.Active) {
						filter.OR = [
							{
								status: SubscriptionStatus.Active,
							},
							{
								endDate: {
									gte: new Date(),
								},
							},
						];
					} else {
						filter.status = status;
					}
				}

				const subscribers = await prisma.paymentSubscription.findMany({
					where: filter,
					select: {
						user: {
							select: {
								id: true,
								username: true,
								displayName: true,
								avatar: true,
							},
						},
					},
					take: limit,
				});

				return subscribers.map((subscriber) => subscriber.user);
			};

			const getTipsGiven = async (creatorId: bigint) => {
				const tips = await prisma.gemsSpendingLog.findMany({
					where: { creatorId },
					select: {
						spender: {
							select: {
								id: true,
								username: true,
								displayName: true,
								avatar: true,
							},
						},
					},
					take: limit,
				});

				return tips.map((tip) => tip.spender);
			};

			const getFansByCategory = async (
				profileId: bigint,
				category: string,
			) => {
				switch (category) {
					case "Individual fans":
						return getFans(profileId, SubscriptionStatus.Active);
					case "All fans":
						return getFans(profileId, SubscriptionStatus.Active);
					case "Cancelled":
						return getFans(profileId, SubscriptionStatus.Cancelled);
					case "Tips Given":
						return getTipsGiven(profileId);
					default:
						throw new Error("Invalid category");
				}
			};

			const fans = await getFansByCategory(profile.id, category);
			reply.send({
				fans: fans
					.filter(
						(v, i, a) => a.findIndex((t) => t.id === v.id) === i,
					)
					.map((fan) => ({
						id: fan.id.toString(),
						username: fan.username!,
						displayName: fan.displayName ?? undefined,
						avatar: fan.avatar ?? undefined,
					})),
			});
		},
	);

	fastify.get(
		"/notes",
		{
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);
			const profile = await session.getProfile(prisma);

			const subscriptions = await prisma.paymentSubscription.findMany({
				where: {
					userId: user.id,
					OR: [
						{
							status: SubscriptionStatus.Active,
						},
						{
							endDate: {
								gt: new Date(),
							},
						},
					],
				},
			});

			const profileIds = subscriptions.map((sub) => sub.creatorId);
			if (profile) profileIds.push(profile.id);

			const notes = await prisma.chatNote.findMany({
				where: {
					profileId: {
						in: profileIds,
					},
					updatedAt: {
						gt: new Date(Date.now() - 1000 * 60 * 60 * 24),
					},
				},
				select: {
					profile: {
						select: {
							displayName: true,
							avatar: true,
						},
					},
					note: true,
				},
				orderBy: {
					updatedAt: "desc",
				},
			});

			reply.send({ notes });
		},
	);

	fastify.post<{ Body: ChatNoteReqBody }>(
		"/notes",
		{
			schema: {
				body: ChatNoteReqBodyValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;

			const profile = await session.getProfile(prisma);
			if (!profile) {
				return reply.sendError(APIErrors.PROFILE_NOT_FOUND);
			}

			const { note } = request.body;
			const existingNote = await prisma.chatNote.findFirst({
				where: {
					profileId: profile.id,
				},
			});

			if (existingNote) {
				await prisma.chatNote.update({
					where: {
						id: existingNote.id,
					},
					data: {
						note,
					},
				});
			} else {
				await prisma.chatNote.create({
					data: {
						id: snowflake.gen(),
						profileId: profile.id,
						note,
					},
				});
			}
		},
	);

	fastify.get(
		"/automated-messages/welcome",
		{
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;

			const profile = await session.getProfile(prisma);
			if (!profile) {
				return reply.sendError(APIErrors.PROFILE_NOT_FOUND);
			}

			const welcomeMessage = await prisma.welcomeMessage.findFirst({
				where: {
					profileId: profile.id,
				},
				select: {
					text: true,
					image: true,
					enabled: true,
					isDelayEnabled: true,
					delay: true,
				},
			});

			reply.send(welcomeMessage);
		},
	);

	fastify.post<{ Body: ChatAutomatedMessageWelcomeReqBody }>(
		"/automated-messages/welcome",
		{
			schema: {
				body: ChatAutomatedMessageWelcomeReqBodyValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;

			const profile = await session.getProfile(prisma);
			if (!profile) {
				return reply.sendError(APIErrors.PROFILE_NOT_FOUND);
			}

			const { text, image, enabled, isDelayEnabled, delay } =
				request.body;

			const welcomeMessage = await prisma.welcomeMessage.findFirst({
				where: {
					profileId: profile.id,
				},
			});

			await prisma.welcomeMessage.upsert({
				where: {
					id: welcomeMessage?.id ?? snowflake.gen(),
					profileId: profile.id,
				},
				create: {
					id: snowflake.gen(),
					profileId: profile.id,
					text,
					image: image ? BigInt(image) : null,
					enabled,
					isDelayEnabled,
					delay,
				},
				update: {
					text,
					image: image ? BigInt(image) : null,
					enabled,
					isDelayEnabled,
					delay,
				},
			});

			reply.status(200).send(welcomeMessage);
		},
	);

	fastify.put<{ Body: UpdateChatAutomatedMessageWelcomeReqBody }>(
		"/automated-messages/welcome/settings",
		{
			schema: {
				body: UpdateChatAutomatedMessageWelcomeReqBodyValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;

			const profile = await session.getProfile(prisma);
			if (!profile) {
				return reply.sendError(APIErrors.PROFILE_NOT_FOUND);
			}

			const { enabled, isDelayEnabled, delay } = request.body;

			const welcomeMessage = await prisma.welcomeMessage.findFirst({
				where: {
					profileId: profile.id,
				},
			});

			await prisma.welcomeMessage.upsert({
				where: {
					id: welcomeMessage?.id ?? snowflake.gen(),
					profileId: profile.id,
				},
				create: {
					id: snowflake.gen(),
					profileId: profile.id,
					enabled,
					isDelayEnabled,
					delay,
				},
				update: {
					enabled,
					isDelayEnabled,
					delay,
				},
			});

			reply.status(201).send();
		},
	);

	fastify.post<{
		Params: ChatIdParams;
	}>(
		"/conversations/:id/pin",
		{
			schema: {
				params: ChatIdParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);
			const channelId = BigInt(request.params.id);

			await inboxManager.pinInbox(user.id, channelId);
			reply.status(201).send();
		},
	);

	fastify.delete<{
		Params: ChatIdParams;
	}>(
		"/conversations/:id/delete",
		{
			schema: {
				params: ChatIdParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);
			const channelId = BigInt(request.params.id);

			await inboxManager.deleteInbox(user.id, channelId);
			reply.status(201).send();
		},
	);

	fastify.get<{
		Querystring: ChannelMediaPageQuery;
		Params: ChatIdParams;
		Reply: MediasRespBody;
	}>(
		"/conversation/:id/medias",
		{
			schema: {
				querystring: ChannelMediaPageQueryValidator,
				params: ChatIdParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);

			const { id } = request.params;
			const { page = 1, size = DEFAULT_PAGE_SIZE, type } = request.query;

			const channel = await inboxManager.getChannelParticipants(
				BigInt(id),
				user.id,
			);
			if (!channel) {
				return reply.sendError(APIErrors.CHANNEL_NOT_FOUND);
			}

			const messageIds = await prisma.message
				.findMany({
					where: {
						channelId: BigInt(id),
						deletedAt: null,
					},
					select: { id: true },
				})
				.then((messages) => messages.map((msg) => msg.id));

			const total = await prisma.upload.count({
				where: {
					messageThumbs: {
						some: {
							id: {
								in: messageIds,
							},
						},
					},
					type: type
						? { in: [UploadType.Video, UploadType.Image] }
						: undefined,
				},
			});

			if (isOutOfRange(page, size, total)) {
				return reply.sendError(APIErrors.OUT_OF_RANGE);
			}

			const uploads = await prisma.upload.findMany({
				where: {
					messageThumbs: {
						some: {
							id: { in: messageIds },
						},
					},
					...(type !== "All" && {
						type: {
							in: [UploadType.Video, UploadType.Image].filter(
								(t) => t === type,
							),
						},
					}),
				},
				include: {
					messageThumbs: true,
				},
				orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
				take: size,
				skip: (page - 1) * size,
			});

			const medias = uploads.map((upload) => ({
				id: upload.id.toString(),
				type: upload.type,
				url: upload.url,
				thumbnail:
					upload.thumbnail === null ? undefined : upload.thumbnail,
				blurhash:
					upload.blurhash === null ? undefined : upload.blurhash,
				origin: upload.origin === null ? undefined : upload.origin,
				isPinned: upload.isPinned,
				updatedAt: upload.updatedAt.toISOString(),
			}));

			reply.send({
				medias,
				page,
				size,
				total,
				hasAccess: true,
			});
		},
	);

	fastify.post<{ Body: CreateMessageReportReqBody }>(
		"/message/report",
		{
			schema: {
				body: CreateMessageReportReqBodyValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);

			const data = request.body;
			const message = await prisma.message.findFirst({
				where: { id: BigInt(data.messageId) },
			});

			if (!message) {
				return reply.sendError(APIErrors.ITEM_NOT_FOUND("Post"));
			}

			const messageReportCount = await prisma.messageReport.count({
				where: { userId: BigInt(session.userId) },
			});

			if (messageReportCount >= maxObjectLimit) {
				return reply.sendError(APIErrors.REACHED_MAX_OBJECT_LIMIT);
			}

			await prisma.messageReport.create({
				data: {
					id: snowflake.gen(),
					messageId: BigInt(data.messageId),
					flag: data.reportFlag,
					reason: data.reason,
					userId: BigInt(session.userId),
				},
			});

			return reply.status(201).send();
		},
	);

	fastify.get<{ Querystring: ChatPaidPostPriceReqQuery }>(
		"/paid-post/price",
		{
			schema: {
				querystring: ChatPaidPostPriceReqQueryValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);

			const { id, customerPaymentProfileId } = request.query;

			let customerInformation;

			if (customerPaymentProfileId) {
				const paymentMethod = await prisma.paymentMethod.findFirst({
					where: {
						userId: user.id,
						provider: "AuthorizeNet",
					},
				});

				if (!paymentMethod) {
					return reply.sendError(APIErrors.NO_PAYMENT_METHOD_FOUND);
				}

				const customerProfile =
					await authorizeNetService.fetchCustomerProfile(
						paymentMethod.token,
					);

				if (customerProfile.getMessages().getResultCode() !== "Ok") {
					return reply.sendError(
						APIErrors.PAYMENT_METHOD_FETCH_FAILED(
							customerProfile
								.getMessages()
								.getMessage()[0]
								.getText(),
						),
					);
				}

				const customerPaymentProfile =
					customerProfile.profile.paymentProfiles.find(
						(profile: any) =>
							profile.customerPaymentProfileId ===
							customerPaymentProfileId,
					);

				if (!customerPaymentProfile) {
					return reply.sendError(APIErrors.PAYMENT_METHOD_NOT_FOUND);
				}

				if (!customerProfile) {
					return reply.sendError(APIErrors.NO_PAYMENT_METHOD_FOUND);
				}

				customerInformation = {
					country: customerPaymentProfile.billTo.country,
					state: customerPaymentProfile.billTo.state,
					city: customerPaymentProfile.billTo.city,
					zip: customerPaymentProfile.billTo.zip,
					address: customerPaymentProfile.billTo.address,
				};
			}

			const message = await prisma.message.findFirst({
				where: { id: BigInt(id) },
			});

			if (!message || !message.value) {
				return reply.sendError(APIErrors.POST_NOT_FOUND);
			}

			const amountDinero = dinero({
				amount: message.value,
			});

			const feesOutput = await feesCalculator.purchaseServiceFees(
				amountDinero.getAmount(),
				customerInformation,
			);

			if (feesOutput instanceof TaxjarError) {
				return reply.sendError(
					APIErrors.PAYMENT_FAILED(feesOutput.detail),
				);
			}

			reply.send({
				amount: feesOutput.amount.getAmount() / DECIMAL_TO_CENT_FACTOR,
				platformFee:
					feesOutput.platformFee.getAmount() / DECIMAL_TO_CENT_FACTOR,
				vatFee: feesOutput.vatFee.getAmount() / DECIMAL_TO_CENT_FACTOR,
				totalAmount:
					feesOutput.totalAmount.getAmount() / DECIMAL_TO_CENT_FACTOR,
			});
		},
	);

	fastify.post<{ Body: PurchaseChatPaidPostReqBody }>(
		"/paid-post/purchase",
		{
			schema: {
				body: PurchaseChatPaidPostReqBodyValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				authorizeNetService.webhookPrehandler,
			],
		},
		async (request, reply) => {
			const { messageId, customerPaymentProfileId, fanReferralCode } =
				request.body;

			const session = request.session!;
			const user = await session.getUser(prisma);

			const message = await prisma.message.findFirst({
				where: { id: BigInt(messageId) },
			});

			if (!message || !message.value) {
				return reply.sendError(APIErrors.POST_NOT_FOUND);
			}

			if (message.userId === user.id) {
				return reply.sendError(APIErrors.PURCHASE_POST_SELF);
			}

			const alreadyPurchased =
				await prisma.chatPaidPostTransaction.findFirst({
					where: {
						userId: user.id,
						messageId: message.id,
						OR: [
							{
								status: TransactionStatus.Successful,
							},
							{
								AND: [
									{
										status: {
											in: [
												TransactionStatus.Initialized,
												TransactionStatus.Submitted,
											],
										},
									},
									{
										createdAt: {
											gte: new Date(
												Date.now() - 5 * 60 * 1000,
											).toISOString(),
										},
									},
								],
							},
						],
					},
				});

			if (alreadyPurchased) {
				return reply.sendError(APIErrors.POST_ALREADY_PURCHASED);
			}

			const paymentMethod = await prisma.paymentMethod.findFirst({
				where: {
					userId: user.id,
					provider: "AuthorizeNet",
				},
			});

			if (!paymentMethod) {
				return reply.sendError(APIErrors.NO_PAYMENT_METHOD_FOUND);
			}

			const customerProfile =
				await authorizeNetService.fetchCustomerProfile(
					paymentMethod.token,
				);

			if (customerProfile.getMessages().getResultCode() !== "Ok") {
				return reply.sendError(
					APIErrors.PAYMENT_METHOD_FETCH_FAILED(
						customerProfile.getMessages().getMessage()[0].getText(),
					),
				);
			}

			const customerPaymentProfile =
				customerProfile.profile.paymentProfiles.find(
					(profile: any) =>
						profile.customerPaymentProfileId ===
						customerPaymentProfileId,
				);

			if (!customerPaymentProfile) {
				return reply.sendError(APIErrors.PAYMENT_METHOD_NOT_FOUND);
			}

			if (!customerProfile) {
				return reply.sendError(APIErrors.NO_PAYMENT_METHOD_FOUND);
			}

			const customerInformation = {
				country: customerPaymentProfile.billTo.country,
				state: customerPaymentProfile.billTo.state,
				city: customerPaymentProfile.billTo.city,
				zip: customerPaymentProfile.billTo.zip,
				address: customerPaymentProfile.billTo.address,
			};

			const amountDinero = dinero({
				amount: message.value,
			});

			const feesOutput = await feesCalculator.purchaseServiceFees(
				amountDinero.getAmount(),
				customerInformation,
			);

			if (feesOutput instanceof TaxjarError) {
				return reply.sendError(
					APIErrors.PAYMENT_FAILED(feesOutput.detail),
				);
			}

			const creator = await prisma.profile.findUnique({
				where: { userId: message.userId, disabled: false },
			});

			if (!creator) {
				return reply.sendError(APIErrors.PROFILE_NOT_FOUND);
			}

			const chatPaidPostTransaction =
				await prisma.chatPaidPostTransaction.create({
					data: {
						id: snowflake.gen(),
						userId: user.id,
						creatorId: creator.id,
						messageId: message.id,
						paymentMethodId: paymentMethod.id,
						paymentProfileId:
							customerPaymentProfile.customerPaymentProfileId,

						provider: "AuthorizeNet",
						amount: feesOutput.amount.getAmount(),
						processingFee: 0,
						platformFee: feesOutput.platformFee.getAmount(),
						vatFee: feesOutput.vatFee.getAmount(),
						status: "Initialized",
						fanReferralCode: fanReferralCode,
					},
				});

			const siftTransaction = async (
				status: "$success" | "$failure" | "$pending",
				orderId?: string,
			) => {
				return await siftService.transaction({
					$user_id: user.id.toString(),
					$user_email: user.email,
					$amount: feesOutput.totalAmount.getAmount() * 10000,
					$currency_code: "USD",
					$order_id: orderId,
					$transaction_id: chatPaidPostTransaction.id.toString(),
					$transaction_type: "$sale",
					$transaction_status: status,
					$ip: request.ip,
					$seller_user_id: message.userId.toString(),
					$billing_address: {
						$name:
							customerPaymentProfile.billTo.firstName +
							" " +
							customerPaymentProfile.billTo.lastName,
						$address_1: customerPaymentProfile.billTo.address,
						$city: customerPaymentProfile.billTo.city,
						$region: customerPaymentProfile.billTo.state,
						$country: customerPaymentProfile.billTo.country,
						$zipcode: customerPaymentProfile.billTo.zip,
					},
					$payment_method: {
						$payment_type: "$credit_card",
						$payment_gateway: "$authorizenet",
						$account_holder_name:
							customerPaymentProfile.billTo.firstName +
							" " +
							customerPaymentProfile.billTo.lastName,
						$card_last4:
							customerPaymentProfile.payment.creditCard.cardNumber.slice(
								-4,
							),
						$verification_status: "$success",
					},
					$browser: {
						$user_agent: request.headers["user-agent"] ?? "",
						$accept_language:
							request.headers["accept-language"] ?? "",
					},
				});
			};

			const response = await siftTransaction("$pending");

			const hasBadPaymentAbuseDecision =
				response.score_response.workflow_statuses.some((workflow) =>
					workflow.history.some(
						(historyItem) =>
							historyItem.config.decision_id ===
							"looks_bad_payment_abuse",
					),
				);

			if (hasBadPaymentAbuseDecision) {
				await prisma.chatPaidPostTransaction.update({
					where: { id: chatPaidPostTransaction.id },
					data: {
						status: "Failed",
						error: "Transaction flagged as fraudulent.",
					},
				});

				await siftTransaction("$failure");

				return reply.sendError(
					APIErrors.PAYMENT_FAILED(
						"Failed because of fraud detection, if you believe this is an error contact support.",
					),
				);
			}

			const paymentResponse =
				await authorizeNetService.createPaymentTransaction({
					customerProfileId: paymentMethod.token,
					customerPaymentProfileId:
						customerPaymentProfile.customerPaymentProfileId,
					description: `Chat Paid Post: ${message.id}`,
					amount:
						feesOutput.totalAmount.getAmount() /
						DECIMAL_TO_CENT_FACTOR,
					merchantData: {
						userId: user.id.toString(),
						transactionId: chatPaidPostTransaction.id.toString(),
					},
				});

			if (paymentResponse.getMessages().getResultCode() !== "Ok") {
				await prisma.chatPaidPostTransaction.update({
					where: { id: chatPaidPostTransaction.id },
					data: {
						status: "Failed",
						error: paymentResponse
							.getMessages()
							.getMessage()[0]
							.getText(),
					},
				});

				await siftTransaction(
					"$failure",
					paymentResponse.transactionResponse.transId,
				);

				return reply.sendError(
					APIErrors.PAYMENT_FAILED(
						paymentResponse.getMessages().getMessage()[0].getText(),
					),
				);
			}

			if (paymentResponse.getTransactionResponse().getErrors()) {
				await prisma.chatPaidPostTransaction.update({
					where: { id: chatPaidPostTransaction.id },
					data: {
						status: "Failed",
						error: paymentResponse
							.getTransactionResponse()
							.getErrors()
							.getError()[0]
							.getErrorText(),
					},
				});

				await siftTransaction(
					"$failure",
					paymentResponse.transactionResponse.transId,
				);

				return reply.sendError(
					APIErrors.PAYMENT_FAILED(
						paymentResponse
							.getTransactionResponse()
							.getErrors()
							.getError()[0]
							.getErrorText(),
					),
				);
			}

			await prisma.chatPaidPostTransaction.update({
				where: { id: chatPaidPostTransaction.id },
				data: {
					status: "Submitted",
					transactionId: paymentResponse
						.getTransactionResponse()
						?.getTransId(),
				},
			});

			const POLL_INTERVAL = 1000;
			const MAX_DURATION = 45000;

			const startTime = Date.now();

			for await (const _ of setInterval(POLL_INTERVAL)) {
				const paidPostTransactionStatus =
					await prisma.chatPaidPostTransaction.findUnique({
						where: { id: chatPaidPostTransaction.id },
						select: { status: true },
					});

				if (
					paidPostTransactionStatus?.status ===
					TransactionStatus.Successful
				) {
					clearInterval(POLL_INTERVAL);
					return reply.send({
						message: "Post purchased successfully!",
					});
				}

				if (Date.now() - startTime > MAX_DURATION) {
					clearInterval(POLL_INTERVAL);
					return reply.sendError(
						APIErrors.PAYMENT_FAILED(
							"Transaction processing took too long. Please check back later.",
						),
					);
				}
			}
		},
	);
}
