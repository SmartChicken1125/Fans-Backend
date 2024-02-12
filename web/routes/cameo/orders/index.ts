import { Logger } from "pino";
import { DateTime } from "luxon";
import {
	CameoVolumeTimeUnit,
	CustomVideoOrderStatus,
	Profile,
	UploadType,
	UploadUsageType,
} from "@prisma/client";
import { FastifyTypebox } from "../../../types.js";
import SessionManagerService, {
	Session,
} from "../../../../common/service/SessionManagerService.js";
import PrismaService from "../../../../common/service/PrismaService.js";
import APIErrors from "../../../errors/index.js";
import { ModelConverter } from "../../../models/modelConverter.js";
import SnowflakeService from "../../../../common/service/SnowflakeService.js";
import { IdParams } from "../../../../common/validators/schemas.js";
import { IdParamsValidator } from "../../../../common/validators/validation.js";
import {
	DEFAULT_PAGE_SIZE,
	isOutOfRange,
	PaginatedQuery,
} from "../../../../common/pagination.js";
import CloudflareStreamService from "../../../../common/service/CloudflareStreamService.js";
import MediaUploadService from "../../../../common/service/MediaUploadService.js";
import { CameoService } from "../../../../common/service/CameoService.js";
import {
	cameoAccepted,
	cameoCancelled,
	cameoCompleted,
	cameoDeclined,
} from "../../../../common/rpc/CameoRPC.js";
import RPCManagerService from "../../../../common/service/RPCManagerService.js";
import {
	CreateCustomVideoOrderBody,
	CreateCustomVideoOrderReview,
	OrdersQuery,
	UpdateCustomVideoUpload,
} from "./schemas.js";
import {
	CreateCustomVideoOrderBodyValidator,
	CreateCustomVideoOrderReviewValidator,
	OrdersQueryValidator,
	UpdateCustomVideoUploadValidator,
} from "./validation.js";

export default async function routes(fastify: FastifyTypebox) {
	const { container } = fastify;

	const logger = await container.resolve<Logger>("logger");
	const sessionManager = await container.resolve(SessionManagerService);
	const prisma = await container.resolve(PrismaService);
	const snowflake = await container.resolve(SnowflakeService);
	const cloudflareStream = await container.resolve(CloudflareStreamService);
	const mediaService = await container.resolve(MediaUploadService);
	const cameoService = await container.resolve(CameoService);
	const rpcService = await container.resolve(RPCManagerService);

	fastify.post<{
		Body: CreateCustomVideoOrderBody;
	}>(
		"/",
		{
			schema: {
				body: CreateCustomVideoOrderBodyValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session as Session;

			const {
				creatorId,
				duration,
				instructions,
				recipientName,
				recipientPronoun,
				paymentToken,
			} = request.body;

			if (
				process.env.CAMEO_BYPASS_PAYMENT_TOKEN &&
				paymentToken !== process.env.CAMEO_BYPASS_PAYMENT_TOKEN
			) {
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}

			const creator = await prisma.profile.findFirst({
				where: { id: BigInt(creatorId) },
			});
			if (!creator || creator.userId === BigInt(session.userId)) {
				return reply.sendError(APIErrors.INVALID_CAMEO_HOST(creatorId));
			}

			const settings = await prisma.customVideoSettings.findFirst({
				where: { profileId: creator.id },
			});
			if (!settings) {
				return reply.sendError(APIErrors.CAMEO_SETTINGS_NOT_FOUND);
			}
			if (!settings.customVideoEnabled) {
				return reply.sendError(APIErrors.CAMEO_DISABLED_BY_CREATOR);
			}

			const dueDate = DateTime.now().plus({
				hour: settings.fulfillmentTime,
			});

			const videoDuration = await prisma.customVideoDuration.findFirst({
				where: { creatorId: creator.id, length: duration },
			});
			if (!videoDuration) {
				return reply.sendError(APIErrors.CAMEO_DURATION_NOT_FOUND);
			}

			// Check order limits
			if (settings.volumeLimit !== null) {
				const units = {
					[CameoVolumeTimeUnit.Monthly]: { month: 1 },
					[CameoVolumeTimeUnit.Weekly]: { day: 7 },
					[CameoVolumeTimeUnit.Daily]: { day: 1 },
				};
				const unitHours = {
					[CameoVolumeTimeUnit.Monthly]: 24 * 30,
					[CameoVolumeTimeUnit.Weekly]: 24 * 7,
					[CameoVolumeTimeUnit.Daily]: 24,
				};
				const limitHours = unitHours[settings.volumeTimeUnit];

				const before =
					limitHours > settings.fulfillmentTime
						? DateTime.now().plus(units[settings.volumeTimeUnit])
						: dueDate;
				const after =
					limitHours > settings.fulfillmentTime
						? DateTime.now()
						: dueDate.minus(units[settings.volumeTimeUnit]);
				const orders = await prisma.customVideoOrder.aggregate({
					where: {
						creatorId: creator.id,
						dueDate: {
							gte: after.toJSDate(),
							lte: before.toJSDate(),
						},
					},
					_count: { id: true },
				});

				if (orders._count.id >= settings.volumeLimit) {
					return reply.sendError(APIErrors.CAMEO_REACHED_ORDER_LIMIT);
				}
			}

			const order = await prisma.customVideoOrder.create({
				data: {
					id: snowflake.gen(),
					creatorId: creator.id,
					fanId: BigInt(session.userId),
					instructions,
					recipientName: recipientName || null,
					recipientPronoun: recipientPronoun || null,
					duration,
					price: videoDuration.price,
					currency: videoDuration.currency,
					dueDate: dueDate.toJSDate(),
				},
			});

			await cameoService.onOrderCreated(order);

			const result = await ModelConverter.toICustomVideoOrder(
				cloudflareStream,
				mediaService,
			)(order);
			return reply.send(result);
		},
	);

	fastify.post<{
		Params: IdParams;
	}>(
		"/:id/accept",
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
			const session = request.session as Session;
			const profile = (await session.getProfile(prisma)) as Profile;

			const order = await prisma.customVideoOrder.findFirst({
				where: { id: BigInt(request.params.id), creatorId: profile.id },
				select: { status: true, autoDeclineJobId: true },
			});
			if (!order) {
				return reply.sendError(APIErrors.CAMEO_ORDER_NOT_FOUND);
			}
			if (order.status !== CustomVideoOrderStatus.Pending) {
				return reply.sendError(APIErrors.INVALID_CAMEO_ORDER_STATE);
			}

			// TODO: charge client

			await cameoService.cancelAutoDeclineOrder(order);
			const updated = await prisma.customVideoOrder.update({
				where: { id: BigInt(request.params.id) },
				data: {
					status: CustomVideoOrderStatus.Accepted,
					autoDeclineJobId: null,
				},
			});

			const orderOutput = await ModelConverter.toICustomVideoOrder(
				cloudflareStream,
				mediaService,
			)(updated);
			cameoAccepted(rpcService, updated.fanId, orderOutput);
			cameoAccepted(rpcService, updated.creatorId, orderOutput);

			return reply.status(200).send();
		},
	);

	fastify.post<{
		Params: IdParams;
	}>(
		"/:id/decline",
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
			const session = request.session as Session;
			const profile = (await session.getProfile(prisma)) as Profile;

			const order = await prisma.customVideoOrder.findFirst({
				where: { id: BigInt(request.params.id), creatorId: profile.id },
				select: { status: true, autoDeclineJobId: true },
			});
			if (!order) {
				return reply.sendError(APIErrors.CAMEO_ORDER_NOT_FOUND);
			}
			if (order.status !== CustomVideoOrderStatus.Pending) {
				return reply.sendError(APIErrors.INVALID_CAMEO_ORDER_STATE);
			}

			await cameoService.cancelAutoDeclineOrder(order);
			const updated = await prisma.customVideoOrder.update({
				where: { id: BigInt(request.params.id) },
				data: {
					status: CustomVideoOrderStatus.Declined,
					autoDeclineJobId: null,
				},
			});

			const orderOutput = await ModelConverter.toICustomVideoOrder(
				cloudflareStream,
				mediaService,
			)(updated);
			cameoDeclined(rpcService, updated.fanId, orderOutput);
			cameoDeclined(rpcService, updated.creatorId, orderOutput);

			return reply.status(200).send();
		},
	);

	fastify.post<{
		Params: IdParams;
	}>(
		"/:id/cancel",
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
			const session = request.session as Session;
			const profile = (await session.getProfile(prisma)) as Profile;

			const order = await prisma.customVideoOrder.findFirst({
				where: { id: BigInt(request.params.id), creatorId: profile.id },
				select: { status: true },
			});
			if (!order) {
				return reply.sendError(APIErrors.CAMEO_ORDER_NOT_FOUND);
			}
			if (order.status !== CustomVideoOrderStatus.Accepted) {
				return reply.sendError(APIErrors.INVALID_CAMEO_ORDER_STATE);
			}

			// TODO: refund client

			const updated = await prisma.customVideoOrder.update({
				where: { id: BigInt(request.params.id) },
				data: { status: CustomVideoOrderStatus.Cancelled },
			});

			const orderOutput = await ModelConverter.toICustomVideoOrder(
				cloudflareStream,
				mediaService,
			)(updated);
			cameoCancelled(rpcService, updated.fanId, orderOutput);
			cameoCancelled(rpcService, updated.creatorId, orderOutput);

			return reply.status(200).send();
		},
	);

	fastify.post<{
		Params: IdParams;
	}>(
		"/:id/fulfill",
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
			const session = request.session as Session;
			const profile = (await session.getProfile(prisma)) as Profile;

			const order = await prisma.customVideoOrder.findFirst({
				where: { id: BigInt(request.params.id), creatorId: profile.id },
				select: { status: true },
			});
			if (!order) {
				return reply.sendError(APIErrors.CAMEO_ORDER_NOT_FOUND);
			}
			if (order.status !== CustomVideoOrderStatus.Accepted) {
				return reply.sendError(APIErrors.INVALID_CAMEO_ORDER_STATE);
			}

			const updated = await prisma.customVideoOrder.update({
				where: { id: BigInt(request.params.id) },
				data: { status: CustomVideoOrderStatus.Completed },
			});

			const orderOutput = await ModelConverter.toICustomVideoOrder(
				cloudflareStream,
				mediaService,
			)(updated);
			cameoCompleted(rpcService, updated.fanId, orderOutput);
			cameoCompleted(rpcService, updated.creatorId, orderOutput);

			return reply.status(200).send();
		},
	);

	fastify.get<{
		Params: IdParams;
	}>(
		"/:id",
		{
			schema: {
				params: IdParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session as Session;

			const order = await prisma.customVideoOrder.findFirst({
				where: { id: BigInt(request.params.id) },
				include: { creator: true, videoUpload: true },
			});
			if (!order) {
				return reply.sendError(APIErrors.CAMEO_ORDER_NOT_FOUND);
			}

			if (
				order.fanId !== BigInt(session.userId) &&
				order.creator.userId !== BigInt(session.userId)
			) {
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}

			const result = await ModelConverter.toICustomVideoOrder(
				cloudflareStream,
				mediaService,
			)(order);
			return reply.send(result);
		},
	);

	fastify.post<{
		Params: IdParams;
		Body: CreateCustomVideoOrderReview;
	}>(
		"/:id/review",
		{
			schema: {
				params: IdParamsValidator,
				body: CreateCustomVideoOrderReviewValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session as Session;

			const order = await prisma.customVideoOrder.findFirst({
				where: { id: BigInt(request.params.id) },
				include: { creator: true },
			});
			if (!order) {
				return reply.sendError(APIErrors.CAMEO_ORDER_NOT_FOUND);
			}
			if (order.fanId !== BigInt(session.userId)) {
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}

			await prisma.customVideoOrder.update({
				where: { id: BigInt(request.params.id) },
				data: {
					score: request.body.score || null,
					review: request.body.review,
				},
			});

			return reply.status(200).send();
		},
	);

	fastify.get<{
		Querystring: PaginatedQuery<OrdersQuery>;
	}>(
		"/",
		{
			schema: {
				querystring: OrdersQueryValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session as Session;
			const profile = await session.getProfile(prisma);
			const {
				page = 1,
				size = DEFAULT_PAGE_SIZE,
				creatorId,
				before,
				after,
				status,
				sort,
			} = request.query;

			const statusMap = {
				pending: CustomVideoOrderStatus.Pending,
				accepted: CustomVideoOrderStatus.Accepted,
				cancelled: CustomVideoOrderStatus.Cancelled,
				declined: CustomVideoOrderStatus.Declined,
				completed: CustomVideoOrderStatus.Completed,
			};
			const orderStatus = status && statusMap[status];
			const statusQuery = status
				? {
						status: orderStatus,
				  }
				: {};
			const where = {
				...(creatorId ? { creatorId: BigInt(creatorId) } : {}),
				OR: [
					{ fanId: BigInt(session.userId) },
					{ creatorId: profile?.id },
				],
				dueDate: {
					lte: before
						? new Date(before)
						: DateTime.utc().plus({ years: 1 }).toJSDate(),
					gte: after
						? new Date(after)
						: DateTime.utc().minus({ years: 1 }).toJSDate(),
				},
				...statusQuery,
			};

			const orderBy = sort ? [] : ([{ id: "desc" }] as any);
			const sortFields = ["createdAt", "dueDate", "price"];
			sort?.split(",")?.forEach((option) => {
				const [field, direction = "desc"] = option.split(":");
				if (
					sortFields.includes(field) &&
					(direction === "asc" || direction === "desc")
				) {
					orderBy.push({ [field]: direction });
				}
			});

			const aggregate = await prisma.customVideoOrder.aggregate({
				where,
				_sum: { price: true },
				_count: { id: true },
			});
			const total = aggregate._count.id;
			if (isOutOfRange(page, size, total)) {
				return reply.sendError(APIErrors.OUT_OF_RANGE);
			}

			const orders = await prisma.customVideoOrder.findMany({
				where,
				orderBy,
				take: size,
				skip: (page - 1) * size,
				include: { videoUpload: true },
			});

			const results = await Promise.all(
				orders.map(
					ModelConverter.toICustomVideoOrder(
						cloudflareStream,
						mediaService,
					),
				),
			);

			return reply.send({
				page,
				size,
				total,
				totalPrice: aggregate._sum.price,
				orders: results,
			});
		},
	);

	fastify.put<{
		Params: IdParams;
		Body: UpdateCustomVideoUpload;
	}>(
		"/:id/video",
		{
			schema: {
				params: IdParamsValidator,
				body: UpdateCustomVideoUploadValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				sessionManager.requireProfileHandler,
			],
		},
		async (request, reply) => {
			const session = request.session as Session;

			const order = await prisma.customVideoOrder.findFirst({
				where: { id: BigInt(request.params.id) },
				include: { creator: true },
			});
			if (!order) {
				return reply.sendError(APIErrors.CAMEO_ORDER_NOT_FOUND);
			}
			if (order.creator.userId !== BigInt(session.userId)) {
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}

			const upload = await prisma.upload.findFirst({
				where: { id: BigInt(request.body.uploadId) },
				select: { id: true, userId: true, usage: true, type: true },
			});
			if (!upload || upload.userId !== BigInt(session.userId)) {
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}
			if (upload.usage !== UploadUsageType.CUSTOM_VIDEO) {
				return reply.sendError(APIErrors.UPLOAD_INVALID_USAGE);
			}
			if (upload.type !== UploadType.Video) {
				return reply.sendError(
					APIErrors.UPLOAD_INVALID_TYPE(
						"This method only accepts Video uploads.",
					),
				);
			}

			await prisma.customVideoOrder.update({
				where: { id: BigInt(request.params.id) },
				data: { videoUploadId: upload.id },
			});

			return reply.send({
				uploadId: String(upload.id),
			});
		},
	);
}
