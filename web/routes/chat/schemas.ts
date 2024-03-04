// This file is supposed to be synced between frontend and backend
// frontend: helper/endpoints/chat/schemas.ts
// backend: web/routes/chat/schemas.ts

import { MessageReportFlag } from "@prisma/client";
import {
	IConversationMeta,
	IMedia,
	IMessage,
	MessageType,
} from "../../CommonAPISchemas.js";

export interface ChatPaginatedQuery {
	page: number;
	itemsPerPage: number;
}

export interface ChatWSInfoRespBody {
	webSocketUrl: string;
}

export interface ChatConversationRespBody {
	conversations: IConversationMeta[];
}

export interface ChatIdParams {
	id: string;
}

export interface ChatDeleteMessageId {
	messageId: string;
}

export interface ChatUserIdParams {
	userId: string;
}

export interface ChatConversationByUserRespBody extends IConversationMeta {}

export interface ChatConversationMessagesQuery {
	/**
	 * The number of messages to fetch
	 */
	limit: number;

	/**
	 * The message ID from before which to fetch messages. `before` and `after` are mutually exclusive.
	 */
	before?: string;
	/**
	 * The message ID from after which to fetch messages. `before` and `after` are mutually exclusive.
	 */
	after?: string;
}

export interface ChatConversationMessagesRespBody {
	messages: IMessage[];
}

export interface ChatConversationMessagesPostReqBody {
	messageType?: number;
	content: string;
	uploadIds?: string[];
	previewUploadIds?: string[];
	value?: string;
	gif?: { source: "tenor" | "giphy"; id: string };
	parentId?: string;
}

export interface ChatConversationMessagesPostRespBody extends IMessage {}

export interface ChatFansListReqParams {
	category: number;
	limit: number;
}

export interface ChatFansListRespBody {
	fans: {
		id: string;
		username: string;
		displayName?: string;
		avatar?: string;
	}[];
}

export interface ChatNoteReqBody {
	note: string;
}

export interface ChatAutomatedMessageWelcomeReqBody {
	text: string;
	image?: string;
	enabled: boolean;
	isDelayEnabled: boolean;
	delay: number;
}

export interface UpdateChatAutomatedMessageWelcomeReqBody {
	enabled: boolean;
	isDelayEnabled: boolean;
	delay: number;
}

export interface TopFanNotificationReqBody {
	top1Enabled: boolean;
	top5Enabled: boolean;
	top10Enabled: boolean;
	customMessageEnabled: boolean;
	text?: string;
	image?: string;
}

export interface UpdateTopFanNotificationReqBody {
	top1Enabled: boolean;
	top5Enabled: boolean;
	top10Enabled: boolean;
	customMessageEnabled: boolean;
}

export interface CreateMessageReportReqBody {
	messageId: string;
	reportFlag: MessageReportFlag;
	reason?: string;
}

export interface MediasRespBody {
	medias: IMedia[];
	page: number;
	size: number;
	total: number;
	videoTotal?: number;
	imageTotal?: number;
	hasAccess: boolean;
}

export interface ChannelMediaPageQuery {
	page: number;
	size: number;
	type?: string;
}

export interface PurchaseChatPaidPostReqBody {
	messageId: string;
	customerPaymentProfileId: string;
	fanReferralCode?: string;
}

export interface ChatPaidPostPriceReqQuery {
	id: string;
	customerPaymentProfileId?: string;
}
