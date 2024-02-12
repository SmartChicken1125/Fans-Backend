import { ICameoOrder } from "../../web/CommonAPISchemas.js";
import { PrismaJson } from "../Types.js";
import RPCManagerService from "../service/RPCManagerService.js";

export enum CameoRPCType {
	CameoRequested = "CAMEO_REQUESTED",
	CameoAccepted = "CAMEO_ACCEPTED",
	CameoDeclined = "CAMEO_DECLINED",
	CameoCancelled = "CAMEO_CANCELLED",
	CameoCompleted = "CAMEO_COMPLETED",
}

export function cameoRequested(
	rpc: RPCManagerService,
	userId: bigint,
	data: Partial<ICameoOrder>,
) {
	const payload = {
		type: CameoRPCType.CameoRequested,
		data: data as PrismaJson<Partial<ICameoOrder>>,
	};

	rpc.publish(`cameo:${userId}`, payload);
}

export function cameoAccepted(
	rpc: RPCManagerService,
	userId: bigint,
	data: Partial<ICameoOrder>,
) {
	const payload = {
		type: CameoRPCType.CameoAccepted,
		data: data as PrismaJson<Partial<ICameoOrder>>,
	};

	rpc.publish(`cameo:${userId}`, payload);
}

export function cameoDeclined(
	rpc: RPCManagerService,
	userId: bigint,
	data: Partial<ICameoOrder>,
) {
	const payload = {
		type: CameoRPCType.CameoDeclined,
		data: data as PrismaJson<Partial<ICameoOrder>>,
	};

	rpc.publish(`cameo:${userId}`, payload);
}

export function cameoCancelled(
	rpc: RPCManagerService,
	userId: bigint,
	data: Partial<ICameoOrder>,
) {
	const payload = {
		type: CameoRPCType.CameoCancelled,
		data: data as PrismaJson<Partial<ICameoOrder>>,
	};

	rpc.publish(`cameo:${userId}`, payload);
}

export function cameoCompleted(
	rpc: RPCManagerService,
	userId: bigint,
	data: Partial<ICameoOrder>,
) {
	const payload = {
		type: CameoRPCType.CameoCompleted,
		data: data as PrismaJson<Partial<ICameoOrder>>,
	};

	rpc.publish(`cameo:${userId}`, payload);
}
