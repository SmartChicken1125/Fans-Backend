import { Inject, Injectable } from "async-injection";
import { Logger } from "pino";
import { DateTime, Interval } from "luxon";
import { CustomVideoOrder, CustomVideoOrderStatus } from "@prisma/client";
import { cameoRequested } from "../rpc/CameoRPC.js";
import { ModelConverter } from "../../web/models/modelConverter.js";
import PrismaService from "./PrismaService.js";
import BullMQService from "./BullMQService.js";
import SnowflakeService from "./SnowflakeService.js";
import RPCManagerService from "./RPCManagerService.js";
import CloudflareStreamService from "./CloudflareStreamService.js";
import MediaUploadService from "./MediaUploadService.js";

const AUTO_DECLINE_DELAY_HOURS = 3 * 24;

@Injectable()
export class CameoService {
	constructor(
		private prisma: PrismaService,
		private bullMQService: BullMQService,
		private snowflake: SnowflakeService,
		private rpcService: RPCManagerService,
		private cloudflareStream: CloudflareStreamService,
		private mediaService: MediaUploadService,
		@Inject("logger") private logger: Logger,
	) {}

	public static readonly QUEUE = "Cameo";

	public static readonly AUTO_DECLINE_JOB = "autoDecline";

	async onOrderCreated(order: CustomVideoOrder) {
		const date = DateTime.now().plus({ hour: AUTO_DECLINE_DELAY_HOURS });
		await this.scheduleAutodeclineOrder(order.id, date.toJSDate());

		const orderOutput = await ModelConverter.toICustomVideoOrder(
			this.cloudflareStream,
			this.mediaService,
		)(order);

		cameoRequested(this.rpcService, order.fanId, orderOutput);
		cameoRequested(this.rpcService, order.creatorId, orderOutput);
	}

	async autoDeclineOrder(orderId: bigint) {
		const order = await this.prisma.customVideoOrder.findFirst({
			where: { id: orderId },
			select: { status: true },
		});
		if (!order || order.status !== CustomVideoOrderStatus.Pending) {
			return;
		}

		this.logger.info(
			`Automatically declining custom video order: ${orderId}`,
		);

		await this.prisma.customVideoOrder.update({
			where: { id: orderId },
			data: {
				status: CustomVideoOrderStatus.Declined,
				autoDeclineJobId: null,
			},
		});
	}

	async cancelAutoDeclineOrder(order: { autoDeclineJobId: string | null }) {
		if (order.autoDeclineJobId) {
			const queue = this.bullMQService.createQueue(CameoService.QUEUE);
			await queue.remove(order.autoDeclineJobId);
		}
	}

	private async scheduleAutodeclineOrder(orderId: bigint, date: Date) {
		const interval = Interval.fromDateTimes(
			DateTime.now(),
			DateTime.fromJSDate(date),
		);
		const queue = this.bullMQService.createQueue(CameoService.QUEUE);
		const job = await queue.add(
			CameoService.AUTO_DECLINE_JOB,
			{ orderId },
			{ delay: interval.length("milliseconds") || 0 },
		);

		await this.prisma.customVideoOrder.update({
			where: { id: orderId },
			data: { autoDeclineJobId: job.id },
		});
	}
}
