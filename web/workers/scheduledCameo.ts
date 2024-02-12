import { Container } from "async-injection";
import { Logger } from "pino";
import BullMQService from "../../common/service/BullMQService.js";
import { CameoService } from "../../common/service/CameoService.js";

export default async function scheduledCameo(container: Container) {
	const bullMQService = await container.resolve(BullMQService);
	const logger = await container.resolve<Logger>("logger");
	const cameoService = await container.resolve(CameoService);

	const worker = bullMQService.createWorker<
		{ orderId: bigint },
		undefined,
		string
	>(CameoService.QUEUE, async (job) => {
		const { orderId } = job.data;

		try {
			if (job.name === CameoService.AUTO_DECLINE_JOB) {
				await cameoService.autoDeclineOrder(orderId);
			}
		} catch (e) {
			logger.error(e, `Job ${job.id} failed with error`);
		}
	});
}
