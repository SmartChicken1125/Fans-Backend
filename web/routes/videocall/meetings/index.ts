import { Logger } from "pino";
import { DateTime, Interval } from "luxon";
import {
	MeetingStatus,
	MeetingUser,
	TransactionStatus,
	User,
} from "@prisma/client";
import {
	DEFAULT_PAGE_SIZE,
	isOutOfRange,
	PaginatedQuery,
} from "../../../../common/pagination.js";
import PrismaService from "../../../../common/service/PrismaService.js";
import SessionManagerService, {
	Session,
} from "../../../../common/service/SessionManagerService.js";
import SnowflakeService from "../../../../common/service/SnowflakeService.js";
import AuthorizeNetService from "../../../../common/service/AuthorizeNetService.js";
import { IdParams } from "../../../../common/validators/schemas.js";
import { IdParamsValidator } from "../../../../common/validators/validation.js";
import { FastifyTypebox } from "../../../types.js";
import { ModelConverter } from "../../../models/modelConverter.js";
import { IMeeting } from "../../../CommonAPISchemas.js";
import APIErrors from "../../../errors/index.js";
import { MeetingService } from "../../../../common/service/MeetingService.js";
import RPCManagerService from "../../../../common/service/RPCManagerService.js";
import { PaymentService } from "../../../../common/service/PaymentService.js";
import { MAX_MEETING_DURATION } from "../durations/validation.js";
import {
	meetingAccepted,
	meetingCancelled,
	meetingRequested,
} from "../../../../common/rpc/MeetingRPC.js";
import { CreateMeetingBody, GetChimeReply, MeetingsQuery } from "./schemas.js";
import {
	CreateMeetingBodyValidator,
	MeetingQueryValidator,
} from "./validation.js";

export default async function routes(fastify: FastifyTypebox) {
	const { container } = fastify;

	const logger = await container.resolve<Logger>("logger");
	const sessionManager = await container.resolve(SessionManagerService);
	const prisma = await container.resolve(PrismaService);
	const snowflake = await container.resolve(SnowflakeService);
	const meetingService = await container.resolve(MeetingService);
	const paymentService = await container.resolve(PaymentService);
	const rpcService = await container.resolve(RPCManagerService);

	fastify.post<{ Body: CreateMeetingBody }>(
		"/",
		{
			schema: { body: CreateMeetingBodyValidator },
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
				paymentService.requirePaymentProfile,
			],
		},
		async (request, reply) => {
			const session = request.session as Session;
			const user = await session.getUser(prisma);

			if (process.env.VIDEOCALL_BYPASS_PAYMENT_TOKEN) {
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}

			// Validate payment method
			if (request.body.customerPaymentProfileId) {
				const error = await paymentService.validatePaymentMethod(
					request.session!,
					request.body.customerPaymentProfileId,
				);
				if (error) {
					return reply.sendError(error);
				}
			}

			const creator = await prisma.profile.findFirst({
				where: { id: BigInt(request.body.hostId), disabled: false },
			});
			if (!creator || creator.userId === BigInt(session.userId)) {
				return reply.sendError(
					APIErrors.INVALID_MEETING_HOST(request.body.hostId),
				);
			}

			const settings = await prisma.meetingSettings.findFirst({
				where: { profileId: creator.id },
			});
			if (!settings) {
				return reply.sendError(APIErrors.MEETING_SETTINGS_NOT_FOUND);
			}
			if (!settings.videoCallsEnabled) {
				return reply.sendError(APIErrors.MEETING_DISABLED_BY_CREATOR);
			}

			// Validate duration
			const duration = await prisma.meetingDuration.findFirst({
				where: {
					creatorId: creator.id,
					length: request.body.duration,
					isEnabled: true,
				},
			});
			if (!duration) {
				return reply.sendError(APIErrors.INVALID_DURATION);
			}

			const isInstantMeeting = request.body.startDate === "now";

			// Validate start date
			const startTime = isInstantMeeting
				? DateTime.now().plus({ minute: 15 })
				: DateTime.fromISO(request.body.startDate);
			const fromNowInterval = Interval.fromDateTimes(
				DateTime.now(),
				startTime,
			);
			if (
				!fromNowInterval.isValid ||
				fromNowInterval.length("week") > 4
			) {
				return reply.sendError(APIErrors.INVALID_MEETING_DATE);
			}
			const meetingTimeInterval = Interval.fromDateTimes(
				startTime,
				startTime.plus({ minute: request.body.duration }),
			);
			if (!meetingTimeInterval.isValid) {
				return reply.sendError(APIErrors.INVALID_INTERVAL);
			}

			// Check meeting conflicts
			const existingMeetings = await prisma.meeting.findMany({
				where: {
					hostId: creator.id,
					startDate: {
						gte: startTime
							.minus({ minute: MAX_MEETING_DURATION })
							.toJSDate(),
					},
					AND: [
						{
							status: { not: MeetingStatus.Cancelled },
						},
						{
							status: { not: MeetingStatus.Declined },
						},
					],
				},
			});
			if (
				existingMeetings.some((existingMeeting) => {
					const existingMeetingInterval = Interval.fromDateTimes(
						DateTime.fromJSDate(existingMeeting.startDate),
						DateTime.fromJSDate(existingMeeting.endDate),
					);
					return existingMeetingInterval.intersection(
						meetingTimeInterval,
					)?.isValid;
				})
			) {
				return reply.sendError(APIErrors.MEETING_CONFLICT);
			}

			// Check if meeting fits into creators time intervals
			const intervals = await prisma.meetingInterval.findMany({
				where: { creatorId: creator.id },
			});
			if (
				!isInstantMeeting &&
				!intervals.some((interval) => {
					const intervalStartTime = DateTime.fromJSDate(
						interval.startTime,
					)
						.toUTC()
						.set({
							year: startTime.year,
							month: startTime.month,
							day: startTime.day,
						})
						.set({
							weekday:
								ModelConverter.weekDay2Index(interval.day) + 1,
						})
						.setZone(settings.timezone || "utc", {
							keepLocalTime: true,
						});
					const intervalEndTime = intervalStartTime.plus({
						minute: interval.length + 1,
					});
					const timeInterval = Interval.fromDateTimes(
						intervalStartTime,
						intervalEndTime,
					);

					return (
						timeInterval.contains(
							meetingTimeInterval.start as DateTime,
						) &&
						timeInterval.contains(
							meetingTimeInterval.end as DateTime,
						)
					);
				})
			) {
				return reply.sendError(APIErrors.MEETING_SCHEDULE_MISMATCH);
			}

			if (settings.vacationsEnabled) {
				// Check vacations
				const vacations = await prisma.meetingVacation.findMany({
					where: { creatorId: creator.id },
				});
				if (
					vacations.some((vacation) => {
						const vacationInterval = Interval.fromDateTimes(
							DateTime.fromJSDate(vacation.startDate),
							DateTime.fromJSDate(vacation.endDate),
						);
						return vacationInterval.intersection(
							meetingTimeInterval,
						)?.isValid;
					})
				) {
					return reply.sendError(APIErrors.MEETING_VACATION_CONFLICT);
				}
			}

			// Create meeting
			const meeting = await meetingService.create({
				host: creator,
				userId: BigInt(session.userId),
				startDate: meetingTimeInterval.start?.toUTC()?.toJSDate(),
				endDate: meetingTimeInterval.end?.toUTC()?.toJSDate(),
				topics: request.body.topics,
				duration,
				isInstant: isInstantMeeting,
			});

			if (request.body.customerPaymentProfileId) {
				const error = await paymentService.bookVideoCall(
					session!,
					request,
					creator,
					user,
					meeting,
					duration.price,
					request.body.customerPaymentProfileId,
				);
				if (error) {
					return reply.sendError(error);
				}
			}

			const responseMeeting = ModelConverter.toIMeeting(meeting);

			meetingRequested(rpcService, creator.userId, responseMeeting);

			return reply.status(200).send(responseMeeting);
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
			const { id: meetingId } = request.params;
			const profile = await session.getProfile(prisma);
			if (!profile) {
				return reply.sendError(APIErrors.PROFILE_NOT_FOUND);
			}

			const meetingStatus = await prisma.meeting.findFirst({
				where: { id: BigInt(meetingId), hostId: profile.id },
				select: { status: true },
			});
			if (!meetingStatus) {
				return reply.sendError(APIErrors.MEETING_NOT_FOUND);
			}
			if (meetingStatus.status !== MeetingStatus.Pending) {
				return reply.sendError(APIErrors.MEETING_INVALID_STATE);
			}

			await prisma.meeting.update({
				where: { id: BigInt(meetingId) },
				data: { status: MeetingStatus.Declined },
			});

			return reply.send();
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
			const { id: meetingId } = request.params;
			const profile = await session.getProfile(prisma);
			if (!profile) {
				return reply.sendError(APIErrors.PROFILE_NOT_FOUND);
			}

			const meetingStatus = await prisma.meeting.findFirst({
				where: { id: BigInt(meetingId), hostId: profile.id },
				select: { status: true },
			});
			if (!meetingStatus) {
				return reply.sendError(APIErrors.MEETING_NOT_FOUND);
			}
			if (meetingStatus.status !== MeetingStatus.Accepted) {
				return reply.sendError(APIErrors.MEETING_INVALID_STATE);
			}

			// TODO: implement refund

			await prisma.meeting.update({
				where: { id: BigInt(meetingId) },
				data: { status: MeetingStatus.Cancelled },
			});

			const meeting = await prisma.meeting.findFirst({
				where: { id: BigInt(meetingId) },
			});
			const meetingUsers = await prisma.meetingUser.findMany({
				where: { meetingId: BigInt(meetingId) },
			});

			if (meeting) {
				meetingUsers.forEach((meetingUser) => {
					meetingCancelled(
						rpcService,
						meetingUser.userId,
						ModelConverter.toIMeeting(meeting),
					);
				});
			}

			return reply.send();
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
			const profile = await session.getProfile(prisma);
			const { id: meetingId } = request.params;

			if (!profile) {
				return reply.sendError(APIErrors.PROFILE_NOT_FOUND);
			}

			if (process.env.VIDEOCALL_BYPASS_PAYMENT_TOKEN) {
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}

			const meeting = await prisma.meeting.findFirst({
				where: {
					id: BigInt(meetingId),
				},
			});
			if (!meeting) {
				return reply.sendError(APIErrors.MEETING_NOT_FOUND);
			}
			if (
				DateTime.fromJSDate(meeting.startDate).minus({ minute: 6 }) <
				DateTime.now()
			) {
				// Too late, meeting will be automatically declined
				return reply.sendError(APIErrors.MEETING_INVALID_STATE);
			}

			const error = await paymentService.purchaseVideoCall(
				session,
				request,
				meetingId,
				profile,
			);
			if (error) {
				return reply.sendError(error);
			}

			await prisma.meeting.update({
				where: {
					id: BigInt(meetingId),
				},
				data: { status: MeetingStatus.Accepted },
			});

			const meetingUsers = await prisma.meetingUser.findMany({
				where: { meetingId: BigInt(meetingId) },
			});

			if (meeting) {
				meetingUsers.forEach((meetingUser) => {
					meetingAccepted(
						rpcService,
						meetingUser.userId,
						ModelConverter.toIMeeting(meeting),
					);
				});
			}

			return reply.status(200).send();
		},
	);

	fastify.get<{
		Querystring: PaginatedQuery<MeetingsQuery>;
	}>(
		"/",
		{
			schema: {
				querystring: MeetingQueryValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const {
				page = 1,
				size = DEFAULT_PAGE_SIZE,
				hostId,
				before,
				after,
				status,
				sort,
				withAttendees,
			} = request.query;

			const session = request.session!;

			const statusMap = {
				pending: MeetingStatus.Pending,
				accepted: MeetingStatus.Accepted,
				cancelled: MeetingStatus.Cancelled,
				declined: MeetingStatus.Declined,
			};
			const meetingStatus = status && statusMap[status];
			const statusQuery = status
				? {
						status: meetingStatus,
				  }
				: {};
			const where = {
				...(hostId ? { hostId: BigInt(hostId) } : {}),
				users: {
					some: {
						userId: BigInt(session.userId),
					},
				},
				startDate: {
					lte: before
						? new Date(before)
						: DateTime.utc().plus({ years: 1 }).toJSDate(),
					gte: after
						? new Date(after)
						: DateTime.utc().minus({ years: 1 }).toJSDate(),
				},
				...statusQuery,
			};

			const orderBy = sort ? [] : ([{ createdAt: "desc" }] as any);
			const sortFields = ["createdAt", "startDate", "price"];
			sort?.split(",")?.forEach((option) => {
				const [field, direction = "desc"] = option.split(":");
				if (field === "oldest") {
					orderBy.push({ createdAt: "asc" });
				}
				if (
					(sortFields.includes(field) && direction === "asc") ||
					direction === "desc"
				) {
					orderBy.push({ [field]: direction });
				}
			});

			const aggregate = await prisma.meeting.aggregate({
				where,
				_sum: { price: true },
				_count: { id: true },
			});
			const total = aggregate._count.id;
			if (isOutOfRange(page, size, total)) {
				return reply.sendError(APIErrors.OUT_OF_RANGE);
			}

			const meetings = await prisma.meeting.findMany({
				where,
				orderBy,
				take: size,
				skip: (page - 1) * size,
				...(withAttendees
					? { include: { users: { include: { user: true } } } }
					: {}),
			});

			const results = meetings
				.map(ModelConverter.toIMeeting)
				.map((meeting, index) => {
					if (withAttendees) {
						return {
							...meeting,
							// @ts-ignore
							attendees: meetings[index].users.map(
								(meetingUser: MeetingUser & { user: User }) =>
									ModelConverter.toIUser(meetingUser.user),
							),
						};
					}

					return meeting;
				});

			return reply.send({
				page,
				size,
				total,
				totalPrice: aggregate._sum.price,
				meetings: results,
			});
		},
	);

	fastify.get<{
		Querystring: MeetingsQuery;
		Params: IdParams;
		Reply: IMeeting;
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
			const session = request.session!;

			const meetingUser = await prisma.meetingUser.findFirst({
				where: {
					userId: BigInt(session.userId),
					meetingId: BigInt(request.params.id),
				},
			});
			if (!meetingUser) {
				// only meeting attendants can query meeting
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}

			const meeting = await meetingService.getById(
				BigInt(request.params.id),
			);
			if (!meeting) {
				return reply.sendError(APIErrors.MEETING_NOT_FOUND);
			}

			return reply.send(ModelConverter.toIMeeting(meeting));
		},
	);

	fastify.get<{
		Params: IdParams;
	}>(
		"/:id/attendees",
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
			const session = request.session!;

			const meeting = await prisma.meeting.findFirst({
				where: { id: BigInt(request.params.id) },
				include: { users: { include: { user: true } } },
			});

			if (!meeting) {
				return reply.sendError(APIErrors.MEETING_NOT_FOUND);
			}

			const attendees = meeting.users.map((meetingUser) =>
				ModelConverter.toIUser(meetingUser.user),
			);

			if (!attendees.some((attendee) => attendee.id === session.userId)) {
				// only meeting attendants can query meeting
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}

			return reply.send({ attendees });
		},
	);

	fastify.get<{
		Querystring: MeetingsQuery;
		Params: IdParams;
		Reply: GetChimeReply;
	}>(
		"/:id/session-configuration",
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
			const session = request.session!;

			const meetingUser = await prisma.meetingUser.findFirst({
				where: {
					userId: BigInt(session.userId),
					meetingId: BigInt(request.params.id),
				},
				include: {
					meeting: true,
				},
			});
			if (!meetingUser) {
				// only meeting attendants can query meeting
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}

			const meeting = await meetingService.getChimeMeeting(
				meetingUser.meeting,
			);
			const attendee = await meetingService.getChimeAttendee(
				meetingUser.meeting,
				meetingUser,
			);

			return reply.send({
				Meeting: meeting?.Meeting,
				Attendee: attendee?.Attendee,
			});
		},
	);
}
