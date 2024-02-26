import { MeetingContentType, MeetingType } from "@prisma/client";
import { IMediaVideoUpload } from "../../CommonAPISchemas.js";

export interface GetAvailabilityQuery {
	creatorId: string;
	before: string;
	after: string;
	duration: number;
}

export interface AvailabilityInterval {
	startDate: string;
	duration: number;
}

export interface GetAvailabilityReply {
	intervals: AvailabilityInterval[];
}

export interface VideoCallProfileMeetingDuration {
	length: number;
	price: number;
	currency: string;
}

export interface VideoCallProfile {
	bufferBetweenCalls: number;
	meetingType: MeetingType;
	sexualContentAllowed: boolean;
	contentPreferences: (typeof MeetingContentType)[keyof typeof MeetingContentType][];
	customContentPreferences?: string;
	meetingTitle?: string;
	meetingDescription?: string;
	meetingDurations: VideoCallProfileMeetingDuration[];
	previews: IMediaVideoUpload[];
}

export interface GetVideoCallPriceParams {
	hostId: string;
	duration: number;
	customerPaymentProfileId?: string;
}
