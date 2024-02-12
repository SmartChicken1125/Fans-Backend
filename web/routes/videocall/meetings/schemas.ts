import {
	GetAttendeeCommandOutput,
	GetMeetingCommandOutput,
} from "@aws-sdk/client-chime-sdk-meetings";

export interface CreateMeetingBody {
	hostId: string;
	startDate: string;
	duration: number;
	customerPaymentProfileId?: string;
	topics?: string;
}

export type MeetingStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface MeetingsQuery {
	hostId?: string;
	before?: string;
	after?: string;
	status?: MeetingStatus;
	sort?: string;
	withAttendees?: "1";
}

export interface GetChimeReply {
	Meeting?: GetMeetingCommandOutput["Meeting"];
	Attendee?: GetAttendeeCommandOutput["Attendee"];
}
