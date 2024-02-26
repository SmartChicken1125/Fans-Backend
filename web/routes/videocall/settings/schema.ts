import { MeetingContentType, MeetingType } from "@prisma/client";
import { MeetingSettingsProgressType } from "../../../CommonAPISchemas.js";

export interface VideoCallSettings {
	bufferBetweenCalls: number;
	meetingType: MeetingType;
	sexualContentAllowed: boolean;
	contentPreferences: (typeof MeetingContentType)[keyof typeof MeetingContentType][];
	customContentPreferences?: string;
	meetingTitle: string;
	meetingDescription?: string;
	notificationNewRequests: boolean;
	notificationCancellations: boolean;
	notificationReminders: boolean;
	notificationsByEmail: boolean;
	notificationsByPhone: boolean;
	videoCallsEnabled: boolean;
	vacationsEnabled: boolean;
	progress: MeetingSettingsProgressType;
	timezone?: string;
}

export type UpdateVideoCallSettings = Partial<VideoCallSettings>;

export type VideoCallSettingsReply = VideoCallSettings;
