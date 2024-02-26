import { Static, Type } from "@sinclair/typebox";
import { assert, Equals } from "tsafe";
import {
	MeetingContentType,
	MeetingSettingsProgress,
	MeetingType,
} from "@prisma/client";
import { UpdateVideoCallSettings } from "./schema.js";

export const UpdateVideoCallSettingsValidator = Type.Object({
	bufferBetweenCalls: Type.Optional(
		Type.Integer({ multipleOf: 5, minimum: 5, maximum: 60 }),
	),
	meetingType: Type.Optional(Type.Enum(MeetingType)),
	sexualContentAllowed: Type.Optional(Type.Boolean()),
	contentPreferences: Type.Optional(
		Type.Array(
			Type.Union([
				Type.Literal(MeetingContentType.Advice),
				Type.Literal(MeetingContentType.Consultation),
				Type.Literal(MeetingContentType.Performance),
				Type.Literal(MeetingContentType.EighteenPlusAdult),
				Type.Literal(MeetingContentType.EighteenPlusSexual),
				Type.Literal(MeetingContentType.Spirituality),
				Type.Literal(MeetingContentType.Endorsement),
			]),
			{ uniqueItems: true },
		),
	),
	customContentPreferences: Type.Optional(Type.String()),
	meetingTitle: Type.Optional(Type.String()),
	meetingDescription: Type.Optional(Type.String()),
	notificationNewRequests: Type.Optional(Type.Boolean()),
	notificationCancellations: Type.Optional(Type.Boolean()),
	notificationReminders: Type.Optional(Type.Boolean()),
	notificationsByEmail: Type.Optional(Type.Boolean()),
	notificationsByPhone: Type.Optional(Type.Boolean()),
	videoCallsEnabled: Type.Optional(Type.Boolean()),
	progress: Type.Optional(
		Type.Union([
			Type.Literal(MeetingSettingsProgress.None),
			Type.Literal(MeetingSettingsProgress.Pricing),
			Type.Literal(MeetingSettingsProgress.Availability),
			Type.Literal(MeetingSettingsProgress.Content),
			Type.Literal(MeetingSettingsProgress.Description),
			Type.Literal(MeetingSettingsProgress.Notifications),
			Type.Literal(MeetingSettingsProgress.Completed),
		]),
	),
	timezone: Type.Optional(Type.String()),
	vacationsEnabled: Type.Optional(Type.Boolean()),
});
assert<
	Equals<
		Static<typeof UpdateVideoCallSettingsValidator>,
		UpdateVideoCallSettings
	>
>();
