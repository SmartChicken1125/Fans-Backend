import { IMeeting } from "../../web/CommonAPISchemas.js";
import { PrismaJson } from "../Types.js";
import RPCManagerService from "../service/RPCManagerService.js";

export enum MeetingRPCType {
	MeetingRequested = "MEETING_REQUESTED",
	MeetingAccepted = "MEETING_ACCEPTED",
	MeetingCancelled = "MEETING_CANCELLED",
	MeetingReminder = "MEETING_REMINDER",
}

export function meetingRequested(
	rpc: RPCManagerService,
	userId: bigint,
	data: Partial<IMeeting>,
) {
	const payload = {
		type: MeetingRPCType.MeetingRequested,
		data: data as PrismaJson<Partial<IMeeting>>,
	};

	rpc.publish(`meeting:${userId}`, payload);
}

export function meetingAccepted(
	rpc: RPCManagerService,
	userId: bigint,
	data: Partial<IMeeting>,
) {
	const payload = {
		type: MeetingRPCType.MeetingAccepted,
		data: data as PrismaJson<Partial<IMeeting>>,
	};

	rpc.publish(`meeting:${userId}`, payload);
}

export function meetingCancelled(
	rpc: RPCManagerService,
	userId: bigint,
	data: Partial<IMeeting>,
) {
	const payload = {
		type: MeetingRPCType.MeetingCancelled,
		data: data as PrismaJson<Partial<IMeeting>>,
	};

	rpc.publish(`meeting:${userId}`, payload);
}

export function meetingReminder(
	rpc: RPCManagerService,
	userId: bigint,
	data: Partial<IMeeting>,
) {
	const payload = {
		type: MeetingRPCType.MeetingReminder,
		data: data as PrismaJson<Partial<IMeeting>>,
	};

	rpc.publish(`meeting:${userId}`, payload);
}
