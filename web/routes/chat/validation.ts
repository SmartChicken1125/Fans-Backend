import { MessageReportFlag } from "@prisma/client";
import { Static, Type } from "@sinclair/typebox";
import { Equals, assert } from "tsafe";
import { gifPayloadSchema } from "../../../common/service/InboxManagerService.js";
import {
	ChannelMediaPageQuery,
	ChatAutomatedMessageWelcomeReqBody,
	ChatConversationMessagesPostReqBody,
	ChatConversationMessagesQuery,
	ChatDeleteMessageId,
	ChatFansListReqParams,
	ChatIdParams,
	ChatNoteReqBody,
	ChatPaginatedQuery,
	ChatUserIdParams,
	CreateMessageReportReqBody,
	PurchaseChatPaidPostReqBody,
	ChatPaidPostPriceReqQuery,
} from "./schemas.js";

export const ChatPaginatedQueryValidator = Type.Object({
	page: Type.Number({
		minimum: 1,
		default: 1,
	}),
	itemsPerPage: Type.Number({
		minimum: 1,
		maximum: 1000,
		default: 100,
	}),
});

assert<
	Equals<Static<typeof ChatPaginatedQueryValidator>, ChatPaginatedQuery>
>();

export const ChatIdParamsValidator = Type.Object({
	id: Type.String({ format: "snowflake" }),
});

assert<Equals<Static<typeof ChatIdParamsValidator>, ChatIdParams>>();

export const ChatDeleteMessageIdValidator = Type.Object({
	messageId: Type.String({ format: "snowflake" }),
});

assert<
	Equals<Static<typeof ChatDeleteMessageIdValidator>, ChatDeleteMessageId>
>();

export const ChatUserIdParamsValidator = Type.Object({
	userId: Type.String({ format: "snowflake" }),
});

assert<Equals<Static<typeof ChatUserIdParamsValidator>, ChatUserIdParams>>();

export const ChatConversationMessagesQueryValidator = Type.Object({
	limit: Type.Number({
		minimum: 1,
		maximum: 100,
		default: 100,
	}),
	before: Type.Optional(Type.String()),
	after: Type.Optional(Type.String()),
});

assert<
	Equals<
		Static<typeof ChatConversationMessagesQueryValidator>,
		ChatConversationMessagesQuery
	>
>();

export const ChatConversationMessagesPostReqBodyValidator = Type.Object({
	messageType: Type.Optional(
		Type.Number({
			minimum: 0,
			maximum: 3,
			default: 0,
		}),
	),
	content: Type.String({
		maxLength: 1000,
	}),
	uploadIds: Type.Optional(
		Type.Array(Type.String({ format: "snowflake" }), {
			maxItems: 4,
		}),
	),
	previewUploadIds: Type.Optional(
		Type.Array(Type.String({ format: "snowflake" }), {
			maxItems: 4,
		}),
	),
	value: Type.Optional(Type.String()),
	gif: Type.Optional(gifPayloadSchema),
	parentId: Type.Optional(Type.String({ format: "snowflake" })),
});

assert<
	Equals<
		Static<typeof ChatConversationMessagesPostReqBodyValidator>,
		ChatConversationMessagesPostReqBody
	>
>();

export const ChatFansListReqParamsValidator = Type.Object({
	category: Type.Number(),
	limit: Type.Number(),
});

assert<
	Equals<Static<typeof ChatFansListReqParamsValidator>, ChatFansListReqParams>
>();

export const ChatNoteReqBodyValidator = Type.Object({
	note: Type.String({
		maxLength: 60,
	}),
});

assert<Equals<Static<typeof ChatNoteReqBodyValidator>, ChatNoteReqBody>>();

export const ChatAutomatedMessageWelcomeReqBodyValidator = Type.Object({
	text: Type.String({
		maxLength: 1000,
	}),
	image: Type.Optional(Type.String()),
	enabled: Type.Boolean(),
});

assert<
	Equals<
		Static<typeof ChatAutomatedMessageWelcomeReqBodyValidator>,
		ChatAutomatedMessageWelcomeReqBody
	>
>();

export const CreateMessageReportReqBodyValidator = Type.Object({
	messageId: Type.Required(Type.String()),
	reportFlag: Type.Enum(MessageReportFlag),
	reason: Type.Optional(Type.String()),
});

assert<
	Equals<
		Static<typeof CreateMessageReportReqBodyValidator>,
		CreateMessageReportReqBody
	>
>();

export const ChannelMediaPageQueryValidator = Type.Object({
	page: Type.Number(),
	size: Type.Number(),
	type: Type.Optional(Type.String()),
});

assert<
	Equals<Static<typeof ChannelMediaPageQueryValidator>, ChannelMediaPageQuery>
>();

export const PurchaseChatPaidPostReqBodyValidator = Type.Object({
	messageId: Type.String({ format: "snowflake" }),
	customerPaymentProfileId: Type.String(),
	fanReferralCode: Type.Optional(Type.String()),
});

assert<
	Equals<
		Static<typeof PurchaseChatPaidPostReqBodyValidator>,
		PurchaseChatPaidPostReqBody
	>
>();

export const ChatPaidPostPriceReqQueryValidator = Type.Object({
	id: Type.String({ format: "snowflake" }),
	customerPaymentProfileId: Type.Optional(Type.String()),
});

assert<
	Equals<
		Static<typeof ChatPaidPostPriceReqQueryValidator>,
		ChatPaidPostPriceReqQuery
	>
>();
