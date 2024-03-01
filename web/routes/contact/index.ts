import EmailerService from "../../../common/service/EmailerService.js";
import { FastifyTypebox } from "../../types.js";
import { SendMessageReqBody } from "./schemas.js";
import { SendMessageReqBodyValidator } from "./validation.js";

export default async function routes(fastify: FastifyTypebox) {
	const { container } = fastify;
	const emailService = await container.resolve(EmailerService);

	fastify.post<{ Body: SendMessageReqBody }>(
		"/",
		{
			schema: { body: SendMessageReqBodyValidator },
		},
		async (request, reply) => {
			// TODO(alula): We should completely remove this endpoint? We're using Zendesk for support tickets.

			// const { name, email, subject, question } = request.body;
			// // todo: Send verification email to user
			// const emailData: SendEmailData = {
			// 	sender: email,
			// 	to: [process.env.SENDINBLUE_SENDER || "support@fyp.fans"],
			// 	textContent: removeTags(question),
			// 	subject: subject,
			// };
			// await emailService.sendEmail(emailData);

			return reply.status(202).send();
		},
	);
}
