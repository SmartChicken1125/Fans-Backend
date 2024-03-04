import { Injectable, Injector } from "async-injection";
import { SubscriptionStatus, TransactionStatus, User } from "@prisma/client";
import PrismaService from "./PrismaService.js";
import SnowflakeService from "./SnowflakeService.js";
import InboxManagerService from "./InboxManagerService.js";
import { MessageType } from "../../web/CommonAPISchemas.js";

const DECIMAL_TO_CENT_FACTOR = 100;

interface SubscriberData {
	user: User;
	earnings: number;
}

@Injectable()
class TopFanNotificationService {
	constructor(
		private prisma: PrismaService,
		private snowflake: SnowflakeService,
		private inboxManager: InboxManagerService,
	) {}

	async calculateEarningsPerFan(
		creatorId: bigint,
	): Promise<SubscriberData[]> {
		const subscribers = await this.prisma.paymentSubscription.findMany({
			where: {
				creatorId: creatorId,
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
			select: {
				user: true,
			},
			orderBy: { startDate: "asc" },
		});

		const subscriptionPayments =
			await this.prisma.paymentSubscriptionTransaction.findMany({
				where: {
					creatorId: creatorId,
					status: TransactionStatus.Successful,
				},
				select: {
					userId: true,
					amount: true,
					createdAt: true,
				},
				orderBy: { createdAt: "asc" },
			});

		const tips = await this.prisma.gemsSpendingLog.findMany({
			where: {
				creatorId: creatorId,
				status: TransactionStatus.Successful,
			},
			select: {
				spenderId: true,
				amount: true,
				createdAt: true,
			},
			orderBy: { createdAt: "asc" },
		});

		const paidPosts = await this.prisma.paidPostTransaction.findMany({
			where: {
				creatorId: creatorId,
				status: TransactionStatus.Successful,
			},
			select: {
				userId: true,
				amount: true,
				createdAt: true,
			},
			orderBy: { createdAt: "asc" },
		});

		const cameoPayments = await this.prisma.cameoPayment.findMany({
			where: {
				creatorId: creatorId,
				status: TransactionStatus.Successful,
			},
			select: {
				userId: true,
				amount: true,
				createdAt: true,
			},
			orderBy: { createdAt: "asc" },
		});

		const earningsPerSubscriber = subscribers.map((subscriber) => {
			let earnings;

			const subscriptionPaymentsForSubscriber =
				subscriptionPayments.filter(
					(payment) => payment.userId === subscriber.user.id,
				);

			const tipsForSubscriber = tips.filter(
				(tip) => tip.spenderId === subscriber.user.id,
			);

			const paidPostsForSubscriber = paidPosts.filter(
				(paidPost) => paidPost.userId === subscriber.user.id,
			);

			const cameoPaymentsForSubscriber = cameoPayments.filter(
				(cameoPayment) => cameoPayment.userId === subscriber.user.id,
			);

			earnings = subscriptionPaymentsForSubscriber.reduce(
				(sum, payment) => sum + payment.amount / DECIMAL_TO_CENT_FACTOR,
				0,
			);

			earnings += tipsForSubscriber.reduce(
				(sum, tip) => sum + tip.amount / DECIMAL_TO_CENT_FACTOR,
				0,
			);

			earnings += paidPostsForSubscriber.reduce(
				(sum, paidPost) =>
					sum + paidPost.amount / DECIMAL_TO_CENT_FACTOR,
				0,
			);

			earnings += cameoPaymentsForSubscriber.reduce(
				(sum, cameoPayment) =>
					sum + cameoPayment.amount / DECIMAL_TO_CENT_FACTOR,
				0,
			);

			return {
				user: subscriber.user,
				earnings,
			};
		});

		return earningsPerSubscriber;
	}

	async fanRanking(creatorId: bigint): Promise<{
		top1Percent: SubscriberData[];
		top5Percent: SubscriberData[];
		top10Percent: SubscriberData[];
	}> {
		const earningsPerFan = await this.calculateEarningsPerFan(creatorId);

		const positiveEarnings = earningsPerFan.filter(
			(fan) => fan.earnings > 0,
		);

		const sortedEarnings = positiveEarnings.sort(
			(a, b) => b.earnings - a.earnings,
		);

		const top1PercentIndex = Math.ceil(sortedEarnings.length * 0.01);
		const top5PercentIndex = Math.ceil(sortedEarnings.length * 0.05);
		const top10PercentIndex = Math.ceil(sortedEarnings.length * 0.1);

		const top1Percent = sortedEarnings.slice(0, top1PercentIndex);
		const top5Percent = sortedEarnings.slice(0, top5PercentIndex);
		const top10Percent = sortedEarnings.slice(0, top10PercentIndex);

		return {
			top1Percent,
			top5Percent,
			top10Percent,
		};
	}

	async sendTopFanNotification(creatorId: bigint): Promise<void> {
		const creator = await this.prisma.profile.findUnique({
			where: {
				id: creatorId,
			},
			select: {
				userId: true,
			},
		});

		const topFanNotification =
			await this.prisma.topFanNotification.findFirst({
				where: {
					profileId: creatorId,
				},
				include: {
					top1Fans: true,
					top5Fans: true,
					top10Fans: true,
				},
			});

		if (!creator || !topFanNotification) {
			return;
		}

		if (
			topFanNotification.top1Enabled ||
			topFanNotification.top5Enabled ||
			topFanNotification.top10Enabled
		) {
			const { top1Percent, top5Percent, top10Percent } =
				await this.fanRanking(creatorId);

			if (topFanNotification.top1Enabled) {
				const top1Fans = top1Percent.map((fan) => fan.user);
				const top1FansToNotify = top1Fans.filter((user) =>
					topFanNotification.top1Fans.some(
						(top1Fan) => top1Fan.userId !== user.id,
					),
				);

				for (const user of top1FansToNotify) {
					const channel =
						await this.inboxManager.getOrCreateConversation(
							creator.userId,
							user.id,
						);

					this.inboxManager.createMessage({
						messageType: MessageType.TOP_FAN_NOTIFICATION,
						channelId: channel.inbox.channelId,
						userId: creator.userId,
						content:
							topFanNotification.customMessageEnabled &&
							topFanNotification.text
								? topFanNotification.text
								: undefined,
						uploadIds:
							topFanNotification.customMessageEnabled &&
							topFanNotification.image
								? [topFanNotification.image]
								: [],
						value: 100,
					});
				}

				await this.prisma.top1Fan.createMany({
					data: top1FansToNotify.map((user) => ({
						id: this.snowflake.gen(),
						creatorId: creatorId,
						userId: user.id,
					})),
				});
			}

			if (topFanNotification.top5Enabled) {
				const top5Fans = top5Percent.map((fan) => fan.user);
				const top5FansToNotify = top5Fans.filter(
					(user) =>
						topFanNotification.top1Fans.some(
							(top1Fan) => top1Fan.userId !== user.id,
						) &&
						topFanNotification.top5Fans.some(
							(top5Fan) => top5Fan.userId !== user.id,
						),
				);

				for (const user of top5FansToNotify) {
					const channel =
						await this.inboxManager.getOrCreateConversation(
							creator.userId,
							user.id,
						);

					this.inboxManager.createMessage({
						messageType: MessageType.TOP_FAN_NOTIFICATION,
						channelId: channel.inbox.channelId,
						userId: creator.userId,
						content:
							topFanNotification.customMessageEnabled &&
							topFanNotification.text
								? topFanNotification.text
								: undefined,
						uploadIds:
							topFanNotification.customMessageEnabled &&
							topFanNotification.image
								? [topFanNotification.image]
								: [],
						value: 500,
					});
				}

				await this.prisma.top5Fan.createMany({
					data: top5FansToNotify.map((user) => ({
						id: this.snowflake.gen(),
						creatorId: creatorId,
						userId: user.id,
					})),
				});
			}

			if (topFanNotification.top10Enabled) {
				const top10Fans = top10Percent.map((fan) => fan.user);
				const top10FansToNotify = top10Fans.filter(
					(user) =>
						topFanNotification.top1Fans.some(
							(top1Fan) => top1Fan.userId !== user.id,
						) &&
						topFanNotification.top5Fans.some(
							(top5Fan) => top5Fan.userId !== user.id,
						) &&
						topFanNotification.top10Fans.some(
							(top10Fan) => top10Fan.userId !== user.id,
						),
				);

				for (const user of top10FansToNotify) {
					const channel =
						await this.inboxManager.getOrCreateConversation(
							creator.userId,
							user.id,
						);

					this.inboxManager.createMessage({
						messageType: MessageType.TOP_FAN_NOTIFICATION,
						channelId: channel.inbox.channelId,
						userId: creator.userId,
						content:
							topFanNotification.customMessageEnabled &&
							topFanNotification.text
								? topFanNotification.text
								: undefined,
						uploadIds:
							topFanNotification.customMessageEnabled &&
							topFanNotification.image
								? [topFanNotification.image]
								: [],
						value: 1000,
					});
				}

				await this.prisma.top10Fan.createMany({
					data: top10FansToNotify.map((user) => ({
						id: this.snowflake.gen(),
						creatorId: creatorId,
						userId: user.id,
					})),
				});
			}
		}
	}
}

export async function topFanNotificationFactory(
	injector: Injector,
): Promise<TopFanNotificationService> {
	const [prisma, snowflakeService, inboxManager] = await Promise.all([
		injector.resolve(PrismaService),
		injector.resolve(SnowflakeService),
		injector.resolve(InboxManagerService),
	]);

	return new TopFanNotificationService(
		prisma,
		snowflakeService,
		inboxManager,
	);
}

export default TopFanNotificationService;
