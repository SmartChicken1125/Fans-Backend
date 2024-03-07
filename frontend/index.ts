import { Container } from "async-injection";
import Fastify from "fastify";
import { Logger } from "pino";

export default async function main(container: Container) {
	container = container.clone();

	const logger = await container.resolve<Logger>("logger");

	const host = process.env.HOST_FRONTEND ?? "::";
	const port = Number(process.env.PORT_FRONTEND ?? 3001);

	const fastify = Fastify({
		logger,
	});

	fastify.get("/api/health", (_req, reply) => {
		reply.send({ status: "ok" });
	});

	await fastify.listen({
		host,
		port,
		listenTextResolver: (addr) => `Frontend service listening at ${addr}`,
	});
}
