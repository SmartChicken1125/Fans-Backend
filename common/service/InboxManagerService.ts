import {
	Message,
	MessageChannel,
	MessageChannelInbox,
	Profile,
	SubscriptionStatus,
	TransactionStatus,
	Upload,
	UploadType,
	UploadUsageType,
} from "@prisma/client";
import { Static, Type } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";
import { Injectable, Injector } from "async-injection";
import { Logger } from "pino";
import {
	IConversationMeta,
	IMessage,
	MessageChannelType,
	MessageType,
} from "../../web/CommonAPISchemas.js";
import { chatAPIErrors } from "../../web/errors/chat.js";
import {
	ModelConverter,
	UserBasicParam,
} from "../../web/models/modelConverter.js";
import { genericAPIErrors } from "../APIErrors/generic.js";
import { APIErrorException } from "../APIErrors/index.js";
import { messageCreated } from "../rpc/ChatRPC.js";
import PrismaService from "./PrismaService.js";
import RPCManagerService from "./RPCManagerService.js";
import SnowflakeService from "./SnowflakeService.js";
import { resolveURLsUploads } from "../../web/utils/UploadUtils.js";
import CloudflareStreamService from "./CloudflareStreamService.js";
import MediaUploadService from "./MediaUploadService.js";

export const gifPayloadSchema = Type.Object({
	source: Type.Union([Type.Literal("tenor"), Type.Literal("giphy")]),
	id: Type.String({ maxLength: 64 }),
});

export type GifPayload = Static<typeof gifPayloadSchema>;

const gifPayloadValidator = TypeCompiler.Compile(gifPayloadSchema);

const DECIMAL_TO_CENT_FACTOR = 100;

interface IMessageCreateOptionsBase {
	/**
	 * Conversation ID to send the message to.
	 */
	channelId: bigint;

	/**
	 * ID of the user who is supposed to be the author of the message. 0 for system messages.
	 */
	userId: bigint;

	/**
	 * Whether to broadcast the message to all participants in the channel. Defaults to true.
	 */
	broadcast?: boolean;
}

interface IMessageCreateOptionsText extends IMessageCreateOptionsBase {
	messageType: MessageType.TEXT;

	/**
	 * Message content. Must be less than 2000 characters and not empty.
	 */
	content: string;

	/**
	 * ID of the message to reply to. Must belong to the same channel.
	 */
	parentId?: string;
}

interface IMessageCreateOptionsMedia extends IMessageCreateOptionsBase {
	messageType: MessageType.MEDIA;

	/**
	 * IDs of the uploads to attach to the message. Must be between 1 and 4 and belong to the user.
	 */
	uploadIds: bigint[];

	/**
	 * ID of the message to reply to. Must belong to the same channel.
	 */
	parentId?: string;
}

interface IMessageCreateOptionsGif extends IMessageCreateOptionsBase {
	messageType: MessageType.GIF;

	/**
	 * Gif payload.
	 */
	gif: GifPayload;

	/**
	 * ID of the message to reply to. Must belong to the same channel.
	 */
	parentId?: string;
}

interface IMessageCreateOptionsPaidPost extends IMessageCreateOptionsBase {
	messageType: MessageType.PAID_POST;

	/**
	 * Message content. Must be less than 2000 characters and not empty.
	 */
	content?: string;

	/**
	 * Message content. Must be less than 2000 characters and not empty.
	 */
	value: number;

	/**
	 * IDs of the uploads to attach to the message. Must be between 1 and 4 and belong to the user.
	 */
	uploadIds: bigint[];

	/**
	 * IDs of the uploads to attach to the message. Must be between 1 and 4 and belong to the user.
	 */
	previewUploadIds?: bigint[];

	/**
	 * Transaction status.
	 */
	status?: TransactionStatus | null;

	/**
	 * ID of the message to reply to. Must belong to the same channel.
	 */
	parentId?: string;
}

/**
 * Options for creating a message.
 */
export type IMessageCreateOptions =
	| IMessageCreateOptionsText
	| IMessageCreateOptionsMedia
	| IMessageCreateOptionsGif
	| IMessageCreateOptionsPaidPost;

export interface MessageWithUser extends Message {
	user: UserBasicParam;
	uploads?: Upload[];
	parentMessage?: MessageWithUser;
	status: TransactionStatus | null;
}

/**
 * A dummy user object used for system messages.
 */
const systemUser: UserBasicParam = Object.seal({
	id: 0n,
	username: "system",
	displayName: "System",
	avatar: null,
});

@Injectable()
class InboxManagerService {
	readonly #prisma: PrismaService;
	readonly #rpc: RPCManagerService;
	readonly #snowflake: SnowflakeService;
	readonly #cloudflareStream: CloudflareStreamService;
	readonly #mediaUpload: MediaUploadService;
	readonly #logger: Logger;

	constructor(
		prisma: PrismaService,
		rpc: RPCManagerService,
		snowflake: SnowflakeService,
		cloudflareStream: CloudflareStreamService,
		mediaUpload: MediaUploadService,
		logger: Logger,
	) {
		this.#prisma = prisma;
		this.#rpc = rpc;
		this.#snowflake = snowflake;
		this.#cloudflareStream = cloudflareStream;
		this.#mediaUpload = mediaUpload;
		this.#logger = logger;
	}

	async openInbox(
		userId: bigint,
		channelId: bigint,
		markAsRead: boolean = true,
	): Promise<MessageChannelInbox> {
		const inbox = await this.#prisma.messageChannelInbox.findFirst({
			where: {
				userId,
				channel: {
					id: channelId,
				},
			},
		});

		if (inbox != null) return inbox;

		const lastReadMessageId = markAsRead
			? await this.#prisma.message
					.findFirst({
						select: {
							id: true,
						},
						where: {
							channelId,
							deletedAt: null,
						},
						orderBy: {
							id: "desc",
						},
					})
					.then((message) => message?.id)
			: undefined;

		return await this.#prisma.messageChannelInbox.create({
			data: {
				user: {
					connect: {
						id: userId,
					},
				},
				channel: {
					connect: {
						id: channelId,
					},
				},
				lastReadMessageId,
			},
		});
	}

	async getConversationMeta(
		inbox: MessageChannelInbox & {
			channel: MessageChannel;
		},
	): Promise<IConversationMeta> {
		const { channel } = inbox;

		if (channel.channelType === MessageChannelType.DIRECT) {
			const otherParticipant =
				await this.#prisma.messageChannelParticipant.findFirst({
					where: {
						channelId: channel.id,
						userId: { not: inbox.userId },
					},
					include: {
						user: {
							select: {
								id: true,
								username: true,
								displayName: true,
								avatar: true,
								profile: {
									select: {
										id: true,
										profileLink: true,
									},
								},
							},
						},
					},
				});

			const xpLevel = await this.#prisma.userLevel.findFirst({
				where: {
					userId: otherParticipant?.user.id,
					creatorId: inbox.userId,
				},
				select: {
					userId: true,
					level: true,
					role: {
						select: {
							icon: true,
							color: true,
						},
					},
				},
				orderBy: { level: "asc" },
			});

			const lastMessage = await this.#prisma.message.findFirst({
				where: {
					channelId: channel.id,
					deletedAt: null,
				},
				include: {
					uploads: true,
				},
				orderBy: {
					id: "desc",
				},
			});

			const unreadCount = await this.#prisma.message.count({
				where: {
					channelId: channel.id,
					id: {
						gt: inbox.lastReadMessageId ?? 0n,
					},
					deletedAt: null,
				},
			});

			const subscription =
				await this.#prisma.paymentSubscription.findFirst({
					where: {
						OR: [
							{
								userId: inbox.userId,
								creatorId: otherParticipant?.user.profile?.id,
								status: SubscriptionStatus.Active,
							},
							{
								userId: otherParticipant?.user.profile?.id,
								creatorId: inbox.userId,
								status: SubscriptionStatus.Active,
							},
						],
					},
				});

			const subscriptionPayments =
				await this.#prisma.paymentSubscriptionTransaction.findMany({
					where: {
						creatorId: subscription?.creatorId,
						status: TransactionStatus.Successful,
					},
					select: {
						userId: true,
						amount: true,
						createdAt: true,
					},
					orderBy: { createdAt: "asc" },
				});

			const tips = await this.#prisma.gemsSpendingLog.findMany({
				where: {
					creatorId: subscription?.creatorId,
					status: TransactionStatus.Successful,
				},
				select: {
					spenderId: true,
					amount: true,
					createdAt: true,
				},
				orderBy: { createdAt: "asc" },
			});

			const paidPosts = await this.#prisma.paidPostTransaction.findMany({
				where: {
					creatorId: subscription?.creatorId,
					status: TransactionStatus.Successful,
				},
				select: {
					userId: true,
					amount: true,
					createdAt: true,
				},
				orderBy: { createdAt: "asc" },
			});

			const cameoPayments = await this.#prisma.cameoPayment.findMany({
				where: {
					creatorId: subscription?.creatorId,
					status: TransactionStatus.Successful,
				},
				select: {
					userId: true,
					amount: true,
					createdAt: true,
				},
				orderBy: { createdAt: "asc" },
			});

			const earnings = [
				...subscriptionPayments,
				...tips,
				...paidPosts,
				...cameoPayments,
			].reduce((acc, curr) => acc + curr.amount, 0);

			await resolveURLsUploads(
				lastMessage?.uploads ?? [],
				this.#cloudflareStream,
				this.#mediaUpload,
			);

			const user = otherParticipant?.user;

			if (user) {
				return {
					id: channel.id.toString(),
					name: user.displayName ?? user.username!,
					icon: user.avatar,
					otherParticipant: user.profile
						? {
								id: user.profile.id.toString(),
								displayName: user.displayName ?? undefined,
								profileLink: user.profile!.profileLink,
						  }
						: undefined,
					lastMessage: lastMessage
						? ModelConverter.toIMessage({ ...lastMessage, user })
						: undefined,
					lastReadMessageId: inbox.lastReadMessageId?.toString(),
					isBlocked: !subscription,
					isPinned: inbox.isPinned,
					earnings: earnings / DECIMAL_TO_CENT_FACTOR,
					xpLevel: xpLevel?.level ?? 0,
					unreadCount,
				};
			}
		}

		return {
			id: channel.id.toString(),
			name: `Conversation: ${channel.id}`,
			icon: null,
			otherParticipant: undefined,
			lastMessage: undefined,
			lastReadMessageId: "0",
			isBlocked: true,
			isPinned: inbox.isPinned,
			earnings: 0,
			xpLevel: 0,
			unreadCount: 0,
		};
	}

	async markAsRead(
		userId: bigint,
		channelId: bigint,
		messageId: bigint,
	): Promise<void> {
		await this.#prisma.messageChannelInbox
			.update({
				where: {
					channelId_userId: {
						channelId,
						userId,
					},
				},
				data: {
					lastReadMessageId: messageId,
				},
			})
			.catch(() => null);
	}

	async pinInbox(userId: bigint, channelId: bigint): Promise<void> {
		await this.#prisma.messageChannelInbox
			.update({
				where: {
					channelId_userId: {
						channelId,
						userId,
					},
				},
				data: {
					isPinned: true,
				},
			})
			.catch(() => null);
	}

	async deleteInbox(userId: bigint, channelId: bigint): Promise<void> {
		await this.#prisma.messageChannelInbox
			.delete({
				where: {
					channelId_userId: {
						channelId,
						userId,
					},
				},
			})
			.catch(() => null);
	}

	async getChannelParticipants(channelId: bigint, userId: bigint) {
		return await this.#prisma.messageChannel.findFirst({
			select: {
				id: true,
				participants: {
					select: {
						userId: true,
					},
				},
			},
			where: {
				id: channelId,
				participants: {
					some: { userId },
				},
			},
		});
	}

	/**
	 * Gets or creates a conversation between two users.
	 *
	 * @param senderId The ID of the user who initiated the conversation.
	 * @param recipientId The ID of the user who is being messaged.
	 */
	async getOrCreateConversation(
		senderId: bigint,
		recipientId: bigint,
	): Promise<{
		inbox: MessageChannelInbox;
		meta: IConversationMeta;
	}> {
		if (recipientId === senderId) {
			throw new APIErrorException(
				genericAPIErrors.CANNOT_PERFORM_ACTION_ON_SELF,
			);
		}

		const recipientUser = await this.#prisma.user.findUnique({
			where: { id: recipientId },
		});

		if (!recipientUser) {
			throw new APIErrorException(genericAPIErrors.USER_NOT_FOUND);
		}

		let participant =
			await this.#prisma.messageChannelParticipant.findFirst({
				where: {
					userId: senderId,
					channel: {
						channelType: MessageChannelType.DIRECT,
						participants: {
							some: { userId: recipientUser.id },
						},
					},
				},
				include: {
					channel: true,
				},
			});

		if (!participant) {
			const channel = await this.#prisma.messageChannel.create({
				data: {
					id: this.#snowflake.gen(),
					name: "",
					channelType: MessageChannelType.DIRECT,
					participants: {
						create: [
							{ userId: senderId },
							{ userId: recipientUser.id },
						],
					},
				},
				include: {
					participants: true,
				},
			});

			participant = {
				...channel.participants[0],
				channel,
			};
		}

		const inbox = await this.openInbox(senderId, participant.channel.id);

		const meta = await this.getConversationMeta({
			...inbox,
			channel: participant.channel,
		});

		return { inbox, meta };
	}

	/**
	 * Resolves users in Message models.
	 * @param messages Array of Message models to resolve users for.
	 * @returns Array of Message models with resolved users.
	 */
	async resolveUsers(
		messages: (Message & { parentMessage?: Message | null })[],
	): Promise<MessageWithUser[]> {
		const userIdSet = new Set<bigint>();

		messages.forEach((message) => {
			userIdSet.add(message.userId);
			if (message.parentMessage) {
				userIdSet.add(message.parentMessage.userId);
			}
		});

		const userIdMap = new Map<bigint, UserBasicParam>();
		userIdMap.set(0n, systemUser);

		const resolved = await this.#prisma.user.findMany({
			where: {
				id: {
					in: Array.from(userIdSet),
				},
			},
			select: {
				id: true,
				username: true,
				displayName: true,
				avatar: true,
			},
		});

		for (const user of resolved) {
			userIdMap.set(user.id, user);
		}

		return messages.map((message) => ({
			...message,
			user: userIdMap.get(message.userId) ?? {
				id: message.userId,
				username: "unknown",
				displayName: "Unknown",
				avatar: null,
			},
			parentMessage: message.parentMessage
				? {
						...message.parentMessage,
						user: userIdMap.get(message.parentMessage.userId) ?? {
							id: message.parentMessage.userId,
							username: "unknown",
							displayName: "Unknown",
							avatar: null,
						},
				  }
				: undefined,
		}));
	}

	/**
	 * Sends a message payload to realtime subscribers and marks the message as read for the author.
	 *
	 * @param participants List of participants in the channel
	 * @param authorId Creator of the message
	 * @param channelId Channel ID
	 * @param messagePayload Message payload
	 */
	async broadcastCreatedMessage(
		participants: Array<{ userId: bigint }>,
		authorId: bigint,
		channelId: bigint,
		messagePayload: IMessage,
	) {
		participants.forEach(async (p) => {
			await this.openInbox(p.userId, channelId, false);
			await messageCreated(this.#rpc, p.userId, messagePayload);
		});
		this.markAsRead(authorId, channelId, BigInt(messagePayload.id));
	}

	/**
	 * Creates a message in the database using the provided options and broadcasts it to realtime subscribers,
	 * unless `broadcast` is set to false.
	 *
	 * @returns An object containing the message payload and the resolved message with user data.
	 * @throws {APIErrorException} If the request is invalid. Can be returned to the endpoint handler as-is.
	 */
	async createMessage(
		options: IMessageCreateOptions,
	): Promise<{ payload: IMessage; message: MessageWithUser }> {
		const { messageType, channelId, userId, parentId } = options;
		const broadcast = options.broadcast ?? true;

		if (
			(await this.#prisma.messageChannel.count({
				where: {
					id: channelId,
				},
			})) === 0
		) {
			throw new APIErrorException(chatAPIErrors.CHANNEL_NOT_FOUND);
		}

		let message: Message | undefined = undefined;
		if (messageType === MessageType.TEXT) {
			const { content } = options;

			if (!content) {
				throw new APIErrorException(
					genericAPIErrors.INVALID_REQUEST("Empty message"),
				);
			}

			if (content.length > 2000) {
				throw new APIErrorException(
					genericAPIErrors.INVALID_REQUEST("Message too long"),
				);
			}

			message = await this.#prisma.message.create({
				include: {
					parentMessage: true,
				},
				data: {
					id: this.#snowflake.gen(),
					channelId,
					userId,
					content,
					messageType,
					parentId: parentId ? BigInt(parentId) : undefined,
				},
			});
		} else if (messageType === MessageType.MEDIA) {
			const { uploadIds } = options;

			if (!uploadIds.length || uploadIds.length > 4) {
				throw new APIErrorException(
					genericAPIErrors.INVALID_REQUEST(
						"Incorrect number of uploads",
					),
				);
			}

			const uploads = await this.#prisma.upload.findMany({
				where: {
					id: {
						in: uploadIds,
					},
					type: { in: [UploadType.Image, UploadType.Video] },
					usage: UploadUsageType.CHAT,
					userId,
					completed: true,
				},
			});

			if (uploads.length === 0) {
				throw new APIErrorException(
					genericAPIErrors.INVALID_REQUEST("Invalid upload IDs"),
				);
			}

			message = await this.#prisma.message.create({
				include: {
					uploads: true,
					parentMessage: true,
				},
				data: {
					id: this.#snowflake.gen(),
					channelId,
					userId,
					content: "",
					messageType,
					uploads: {
						connect: uploads.map((u) => ({
							id: BigInt(u.id),
						})),
					},
					parentId: parentId ? BigInt(parentId) : undefined,
				},
			});
		} else if (messageType === MessageType.GIF) {
			const { gif } = options;
			if (!gifPayloadValidator.Check(gif)) {
				throw new APIErrorException(
					genericAPIErrors.INVALID_REQUEST("Invalid 'gif' payload"),
				);
			}

			message = await this.#prisma.message.create({
				include: {
					parentMessage: true,
				},
				data: {
					id: this.#snowflake.gen(),
					channelId,
					userId,
					content: JSON.stringify({
						source: gif.source,
						id: gif.id,
					}),
					messageType,
					parentId: parentId ? BigInt(parentId) : undefined,
				},
			});
		} else if (messageType === MessageType.PAID_POST) {
			const { content, value, uploadIds, previewUploadIds } = options;

			if (!value) {
				throw new APIErrorException(
					genericAPIErrors.INVALID_REQUEST("Empty value"),
				);
			}

			if (!uploadIds.length || uploadIds.length > 4) {
				throw new APIErrorException(
					genericAPIErrors.INVALID_REQUEST(
						"Incorrect number of uploads",
					),
				);
			}

			const uploads = await this.#prisma.upload.findMany({
				where: {
					id: {
						in: uploadIds,
					},
					type: { in: [UploadType.Image, UploadType.Video] },
					usage: UploadUsageType.CHAT,
					userId,
					completed: true,
				},
			});

			if (uploads.length === 0) {
				throw new APIErrorException(
					genericAPIErrors.INVALID_REQUEST("Invalid upload IDs"),
				);
			}

			const previewUploads = previewUploadIds
				? await this.#prisma.upload.findMany({
						where: {
							id: {
								in: previewUploadIds,
							},
							type: { in: [UploadType.Image, UploadType.Video] },
							usage: UploadUsageType.CHAT,
							userId,
							completed: true,
						},
				  })
				: [];

			message = await this.#prisma.message.create({
				include: {
					uploads: true,
					parentMessage: true,
				},
				data: {
					id: this.#snowflake.gen(),
					channelId,
					userId,
					content: content ?? "",
					value,
					messageType,
					uploads: {
						connect: uploads.map((u) => ({
							id: BigInt(u.id),
						})),
					},
					previewUploads: {
						connect: previewUploads.map((u) => ({
							id: BigInt(u.id),
						})),
					},
					status: TransactionStatus.Submitted,
					parentId: parentId ? BigInt(parentId) : undefined,
				},
			});
		} else {
			throw new APIErrorException(
				genericAPIErrors.INVALID_REQUEST("Invalid message type"),
			);
		}

		const [resolvedMessage] = await this.resolveUsers([message]);
		const messagePayload = ModelConverter.toIMessage(resolvedMessage);

		if (broadcast) {
			const channel = await this.getChannelParticipants(
				channelId,
				userId,
			);

			this.broadcastCreatedMessage(
				channel!.participants,
				userId,
				channelId,
				messagePayload,
			);
		}

		return {
			payload: messagePayload,
			message: resolvedMessage,
		};
	}

	async deleteMessage(
		channelId: bigint,
		messageId: bigint,
		userId: bigint,
	): Promise<void> {
		await this.#prisma.message.update({
			where: {
				id: messageId,
				channelId,
				userId,
			},
			data: {
				deletedAt: new Date(),
			},
		});
	}
}

export async function inboxManagerFactory(
	container: Injector,
): Promise<InboxManagerService> {
	const prisma = await container.resolve(PrismaService);
	const rpc = await container.resolve(RPCManagerService);
	const snowflake = await container.resolve(SnowflakeService);
	const cloudflareStream = await container.resolve(CloudflareStreamService);
	const mediaUpload = await container.resolve(MediaUploadService);
	const logger = await container.resolve<Logger>("logger");

	return new InboxManagerService(
		prisma,
		rpc,
		snowflake,
		cloudflareStream,
		mediaUpload,
		logger,
	);
}

export default InboxManagerService;
