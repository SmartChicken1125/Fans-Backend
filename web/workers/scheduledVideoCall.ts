import { Container } from "async-injection";
import { Logger } from "pino";
import BullMQService from "../../common/service/BullMQService.js";
import { MeetingService } from "../../common/service/MeetingService.js";

export default async function scheduledVideoCall(container: Container) {
	const bullMQService = await container.resolve(BullMQService);
	const meetingService = await container.resolve(MeetingService);
	const logger = await container.resolve<Logger>("logger");

	const worker = bullMQService.createWorker<
		{ videoCallId: bigint },
		undefined,
		string
	>("VideoCall", async (job) => {
		const { videoCallId } = job.data;

		try {
			if (job.name === "endCall") {
				await meetingService.endCall(videoCallId);
			}
		} catch (e) {
			logger.error(e, `Job ${job.id} failed with error`);
		}
	});
}
