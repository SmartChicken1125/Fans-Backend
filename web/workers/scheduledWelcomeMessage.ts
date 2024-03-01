import BullMQService from "../../common/service/BullMQService.js";
import PrismaService from "../../common/service/PrismaService.js";
import InboxManagerService from "../../common/service/InboxManagerService.js";
import { Container } from "async-injection";
import { MessageType } from "../CommonAPISchemas.js";

export default async function scheduledWelcomeMessage(container: Container) {
	const bullMQService = await container.resolve(BullMQService);
	const prismaService = await container.resolve(PrismaService);

	const welcomeMessageWorker = bullMQService.createWorker<
		{ profileId: bigint; userId: bigint; fanId: bigint },
		undefined,
		string
	>("scheduledMessage", async (job) => {
		const { profileId, userId, fanId } = job.data;

		const welcomeMessage = await prismaService.welcomeMessage.findFirst({
			where: {
				profileId,
				enabled: true,
			},
		});

		if (welcomeMessage) {
			const inboxManager = await container.resolve(InboxManagerService);
			const channel = await inboxManager.getOrCreateConversation(
				userId,
				fanId,
			);

			if (welcomeMessage.text) {
				inboxManager.createMessage({
					messageType: MessageType.TEXT,
					channelId: channel.inbox.channelId,
					userId: userId,
					content: welcomeMessage.text,
				});
			}

			if (welcomeMessage.image) {
				inboxManager.createMessage({
					messageType: MessageType.MEDIA,
					channelId: channel.inbox.channelId,
					userId: userId,
					uploadIds: [welcomeMessage.image],
				});
			}
		}
	});
}
