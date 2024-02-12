import { DEFAULT_PAGE_SIZE, isOutOfRange } from "../../../common/pagination.js";
import PrismaService from "../../../common/service/PrismaService.js";
import SessionManagerService from "../../../common/service/SessionManagerService.js";
import {
	IdParams,
	QueryWithPageParams,
} from "../../../common/validators/schemas.js";
import {
	IdParamsValidator,
	QueryWithPageParamsValidator,
} from "../../../common/validators/validation.js";
import APIErrors from "../../errors/index.js";
import { FastifyTypebox } from "../../types.js";
import {
	ReviewCreateReqBody,
	ReviewResBody,
	ReviewsResBody,
} from "./schema.js";
import { ModelConverter } from "../../models/modelConverter.js";
import { ReviewCreateReqBodyValidator } from "./validation.js";
import SnowflakeService from "../../../common/service/SnowflakeService.js";
import { SubscriptionStatus } from "@prisma/client";

export default async function routes(fastify: FastifyTypebox) {
	const { container } = fastify;
	const prisma = await container.resolve(PrismaService);
	const sessionManager = await container.resolve(SessionManagerService);
	const snowflake = await container.resolve(SnowflakeService);

	fastify.get<{ Querystring: QueryWithPageParams }>(
		"/",
		{
			schema: {
				querystring: QueryWithPageParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const profile = (await session.getProfile(prisma))!;
			const {
				query = "",
				page = 1,
				size = DEFAULT_PAGE_SIZE,
			} = request.query;
			const total = await prisma.review.count({
				where: {
					text: {
						contains: query,
						mode: "insensitive",
					},
					creatorId: profile.id,
				},
			});

			if (isOutOfRange(page, size, total)) {
				return reply.sendError(APIErrors.OUT_OF_RANGE);
			}

			const rows = await prisma.review.findMany({
				where: {
					text: {
						contains: query,
						mode: "insensitive",
					},
					creatorId: profile.id,
				},
				include: {
					creator: true,
					user: true,
				},
				take: size,
				skip: (page - 1) * size,
			});

			const result: ReviewsResBody = {
				reviews: rows.map((row) => ({
					...ModelConverter.toIReview(row),
				})),
				page,
				size,
				total,
			};

			return reply.send(result);
		},
	);

	fastify.get<{ Params: IdParams }>(
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
			const { id } = request.params;
			const session = request.session!;
			const profile = (await session.getProfile(prisma))!;
			const row = await prisma.review.findFirst({
				where: {
					creatorId: profile.id,
					id: BigInt(id),
				},
			});
			if (!row)
				return reply.sendError(APIErrors.ITEM_NOT_FOUND("Review"));
			const result: ReviewResBody = ModelConverter.toIReview(row);
			return reply.send(result);
		},
	);

	fastify.post<{ Body: ReviewCreateReqBody }>(
		"/",
		{
			schema: { body: ReviewCreateReqBodyValidator },
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = (await session.getUser(prisma))!;
			const profile = await session.getProfile(prisma);
			const data = request.body;

			if (profile?.id.toString() === data.creatorId) {
				return reply.sendError(APIErrors.REVIEW_SELF);
			}

			const subscribed = await prisma.paymentSubscription.findFirst({
				where: {
					userId: BigInt(user.id),
					creatorId: BigInt(data.creatorId),
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

			if (!subscribed) {
				return reply.sendError(APIErrors.SUBSCRIPTION_NOT_FOUND);
			}

			const existingReview = await prisma.review.findFirst({
				where: {
					userId: BigInt(user.id),
					creatorId: BigInt(data.creatorId),
				},
			});

			if (existingReview) {
				return reply.sendError(APIErrors.REVIEW_ALREADY_EXISTS);
			}

			const created = await prisma.review.create({
				data: {
					id: snowflake.gen(),
					text: data.text ?? "",
					score: data.score,
					creatorId: BigInt(data.creatorId),
					userId: user.id,
				},
			});

			const result: ReviewResBody = ModelConverter.toIReview(created);
			return reply.send(result);
		},
	);
}
