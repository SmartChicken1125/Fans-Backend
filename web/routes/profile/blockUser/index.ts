import { SubscriptionStatus } from "@prisma/client";
import PrismaService from "../../../../common/service/PrismaService.js";
import SessionManagerService from "../../../../common/service/SessionManagerService.js";
import SnowflakeService from "../../../../common/service/SnowflakeService.js";
import {
	IdParams,
	QueryParams,
} from "../../../../common/validators/schemas.js";
import {
	IdParamsValidator,
	QueryParamsValidator,
} from "../../../../common/validators/validation.js";
import APIErrors from "../../../errors/index.js";
import { ModelConverter } from "../../../models/modelConverter.js";
import { FastifyTypebox } from "../../../types.js";
import {
	BlockUserRespBody,
	GetBlockedUsersRespBody,
	SearchUserRespBody,
} from "./schemas.js";

export default async function routes(fastify: FastifyTypebox) {
	const { container } = fastify;
	const prisma = await container.resolve(PrismaService);
	const snowflake = await container.resolve(SnowflakeService);
	const sessionManager = await container.resolve(SessionManagerService);

	// Get all blocked users
	fastify.get(
		"/",
		{
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const profile = (await session.getProfile(prisma))!;

			try {
				const blockedUsers = await prisma.blockedUser.findMany({
					where: { creatorId: profile.id },
					include: { user: true },
				});
				const result: GetBlockedUsersRespBody = {
					blockedUsers: blockedUsers.map((bu) => ({
						...ModelConverter.toIUser(bu.user),
					})),
				};
				return reply.send(result);
			} catch (err) {
				return reply.sendError(APIErrors.GENERIC_ERROR);
			}
		},
	);

	// Block a user by ID
	fastify.post<{ Params: IdParams }>(
		"/:id",
		{
			schema: { params: IdParamsValidator },
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const { id: userId } = request.params;
			const session = request.session!;
			const profile = (await session.getProfile(prisma))!;
			const paymentSubscriptionCount =
				await prisma.paymentSubscription.count({
					where: {
						userId: BigInt(userId),
						creatorId: profile.id,
						OR: [
							{
								status: SubscriptionStatus.Active,
							},
							{
								endDate: {
									gte: new Date(),
								},
							},
						],
					},
				});
			if (paymentSubscriptionCount === 0) {
				return reply.sendError(APIErrors.NOT_SUBSCRIBED);
			}

			const existedBlockUserCount = await prisma.blockedUser.count({
				where: { creatorId: profile.id, userId: BigInt(userId) },
			});

			if (existedBlockUserCount > 0) {
				return reply.sendError(APIErrors.ALREADY_BLOCKED);
			}

			const created = await prisma.blockedUser.create({
				data: {
					id: snowflake.gen(),
					userId: BigInt(userId),
					creatorId: profile.id,
				},
				include: { user: true },
			});

			const result: BlockUserRespBody = {
				blockedUser: ModelConverter.toIUser(created.user),
			};
			return reply.send(result);
		},
	);

	// Unblock a user by ID
	fastify.delete<{ Params: IdParams }>(
		"/:id",
		{
			schema: {
				params: IdParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			try {
				const { id: userId } = request.params;
				const session = request.session!;
				const profile = (await session.getProfile(prisma))!;

				const existedBlockUserCount = await prisma.blockedUser.count({
					where: { userId: BigInt(userId), creatorId: profile.id },
				});
				if (existedBlockUserCount === 0) {
					return reply.sendError(APIErrors.NOT_BLOCKED);
				}

				await prisma.blockedUser.deleteMany({
					where: { userId: BigInt(userId), creatorId: profile.id },
				});
				return reply.status(202).send();
			} catch (err) {
				return reply.sendError(APIErrors.GENERIC_ERROR);
			}
		},
	);

	// Search subscribed users with query string
	fastify.get<{ Querystring: QueryParams }>(
		"/search-user",
		{
			schema: {
				querystring: QueryParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const { query = "" } = request.query;
			const session = request.session!;
			const profile = (await session.getProfile(prisma))!;
			const paymentSubscriptions =
				await prisma.paymentSubscription.findMany({
					where: {
						creatorId: profile.id,
						OR: [
							{
								status: SubscriptionStatus.Active,
							},
							{
								endDate: {
									gte: new Date(),
								},
							},
						],
						user: {
							OR: [
								{
									username: {
										contains: query,
										mode: "insensitive",
									},
								},
								{
									displayName: {
										contains: query,
										mode: "insensitive",
									},
								},
							],
						},
					},
					include: { user: true },
				});
			const result: SearchUserRespBody = {
				users: paymentSubscriptions.map((ps) =>
					ModelConverter.toIUser(ps.user),
				),
			};
			return reply.send(result);
		},
	);
}
