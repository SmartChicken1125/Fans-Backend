import { Inject, Injectable } from "async-injection";
import { Logger } from "pino";
import { FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { APIContracts } from "authorizenet";
import { setInterval } from "node:timers/promises";
import {
	Meeting,
	PaymentMethod,
	Profile,
	TransactionStatus,
	User,
} from "@prisma/client";
import dinero, { Dinero } from "dinero.js";
import { requestContext } from "@fastify/request-context";
import { TaxjarError } from "taxjar/dist/util/types.js";
import APIErrors from "../../web/errors/index.js";
import { authAPIErrors } from "../APIErrors/auth.js";
import PrismaService from "./PrismaService.js";
import SnowflakeService from "./SnowflakeService.js";
import AuthorizeNetService from "./AuthorizeNetService.js";
import FeesCalculator from "./FeesCalculatorService.js";
import SiftService from "./SiftService.js";
import { Session } from "./SessionManagerService.js";
import { APIError } from "../APIErrors/index.js";

declare module "@fastify/request-context" {
	interface RequestContextData {
		paymentMethod?: PaymentMethod;
		customerProfile?: APIContracts.GetCustomerProfileResponse;
	}
}

@Injectable()
export class PaymentService {
	requirePaymentProfile: preHandlerAsyncHookHandler;

	constructor(
		private prisma: PrismaService,
		private snowflake: SnowflakeService,
		private authorizeNetService: AuthorizeNetService,
		private feesCalculator: FeesCalculator,
		private siftService: SiftService,
		@Inject("logger") private logger: Logger,
	) {
		this.#createHandlers();
	}

	private static readonly PAYMENT_METHOD_CONTEXT_KEY = "paymentMethod";
	private static readonly CUSTOMER_PROFILE_CONTEXT_KEY = "customerProfile";

	async getPaymentMethod(session: Session) {
		const cached = requestContext.get(
			PaymentService.PAYMENT_METHOD_CONTEXT_KEY,
		);
		if (cached) {
			return cached;
		}

		const paymentMethod = await this.prisma.paymentMethod.findFirst({
			where: {
				userId: BigInt(session.userId),
				provider: "AuthorizeNet",
			},
		});
		if (paymentMethod) {
			requestContext.set(
				PaymentService.PAYMENT_METHOD_CONTEXT_KEY,
				paymentMethod,
			);
		}

		return paymentMethod;
	}

	async getCustomerProfile(
		session: Session,
	): Promise<APIContracts.GetCustomerProfileResponse> {
		const cached = requestContext.get(
			PaymentService.CUSTOMER_PROFILE_CONTEXT_KEY,
		);
		if (cached) {
			return cached;
		}
		const paymentMethod = await this.getPaymentMethod(session);
		const profile: APIContracts.GetCustomerProfileResponse =
			await this.authorizeNetService.fetchCustomerProfile(
				paymentMethod!.token,
			);
		if (profile) {
			requestContext.set(
				PaymentService.CUSTOMER_PROFILE_CONTEXT_KEY,
				profile,
			);
		}
		return profile;
	}

	async getCustomerPaymentProfile(
		session: Session,
		customerPaymentProfileId: string,
	) {
		const customerProfile = await this.getCustomerProfile(session);
		return customerProfile.profile.paymentProfiles.find(
			(profile: any) =>
				profile.customerPaymentProfileId === customerPaymentProfileId,
		);
	}

	#createHandlers() {
		this.requirePaymentProfile = async (request, reply) => {
			const paymentToken =
				request.body && ((request.body as any).paymentToken as string);
			if (
				process.env.VIDEOCALL_BYPASS_PAYMENT_TOKEN &&
				paymentToken !== process.env.VIDEOCALL_BYPASS_PAYMENT_TOKEN
			) {
				return reply.sendError(APIErrors.PERMISSION_ERROR);
			}
			if (paymentToken) {
				return;
			}

			if (!request.session) {
				return reply.sendError(authAPIErrors.UNAUTHORIZED);
			}

			const paymentMethod = await this.getPaymentMethod(request.session!);
			if (!paymentMethod) {
				return reply.sendError(APIErrors.NO_PAYMENT_METHOD_FOUND);
			}

			const customerProfile = await this.getCustomerProfile(
				request.session!,
			);

			if (customerProfile.getMessages().getResultCode() !== "Ok") {
				return reply.sendError(
					APIErrors.PAYMENT_METHOD_FETCH_FAILED(
						customerProfile.getMessages().getMessage()[0].getText(),
					),
				);
			}

			if (!customerProfile) {
				return reply.sendError(APIErrors.NO_PAYMENT_METHOD_FOUND);
			}
		};
	}

	async validatePaymentMethod(
		session: Session,
		customerPaymentProfileId: string,
	) {
		const customerPaymentProfile = await this.getCustomerPaymentProfile(
			session,
			customerPaymentProfileId,
		);

		if (!customerPaymentProfile) {
			return APIErrors.PAYMENT_METHOD_NOT_FOUND;
		}
	}

	async calculateVideoCallPrice(
		session: Session,
		price: number,
		paymentProfileId: string,
	): Promise<Record<string, dinero.Dinero> | TaxjarError> {
		const paymentMethod = (await this.getPaymentMethod(
			session,
		)) as PaymentMethod;
		const customerPaymentProfile = await this.getCustomerPaymentProfile(
			session,
			paymentProfileId,
		);
		const customerProfile = await this.getCustomerProfile(session);

		// Calculate fees
		let customerInformation;

		if (customerPaymentProfile) {
			customerInformation = {
				country: customerPaymentProfile.billTo.country,
				state: customerPaymentProfile.billTo.state,
				city: customerPaymentProfile.billTo.city,
				zip: customerPaymentProfile.billTo.zip,
				address: customerPaymentProfile.billTo.address,
			};
		}

		console.log("price", price);

		const amountDinero = dinero({
			amount: price,
		});

		const feesOutput = await this.feesCalculator.purchaseServiceFees(
			amountDinero.getAmount(),
			customerInformation,
		);

		return feesOutput;
	}

	async bookVideoCall(
		session: Session,
		request: FastifyRequest,
		creator: Profile,
		fan: User,
		meeting: Meeting,
		price: number,
		paymentProfileId: string,
	) {
		const paymentMethod = (await this.getPaymentMethod(
			session,
		)) as PaymentMethod;
		const customerPaymentProfile = await this.getCustomerPaymentProfile(
			session,
			paymentProfileId,
		);
		const customerProfile = await this.getCustomerProfile(session);

		// Calculate fees
		const customerInformation = {
			country: customerPaymentProfile.billTo.country,
			state: customerPaymentProfile.billTo.state,
			city: customerPaymentProfile.billTo.city,
			zip: customerPaymentProfile.billTo.zip,
			address: customerPaymentProfile.billTo.address,
		};

		const amountDinero = dinero({
			amount: price,
		});

		const feesOutput = await this.feesCalculator.purchaseServiceFees(
			amountDinero.getAmount(),
			customerInformation,
		);

		if (feesOutput instanceof TaxjarError) {
			return APIErrors.PAYMENT_FAILED(feesOutput.detail);
		}

		const videoCallPurchase = await this.prisma.videoCallPurchase.create({
			data: {
				id: this.snowflake.gen(),
				fanId: fan.id,
				creatorId: creator.id,
				meetingId: meeting.id,
				paymentMethodId: paymentMethod.id,
				paymentProfileId:
					customerPaymentProfile.customerPaymentProfileId,

				provider: "AuthorizeNet",
				amount: feesOutput.amount.getAmount(),
				processingFee: 0,
				platformFee: feesOutput.platformFee.getAmount(),
				vatFee: feesOutput.vatFee.getAmount(),
				status: "Initialized",
			},
		});

		const siftTransaction = async (
			status: "$success" | "$failure" | "$pending",
			orderId?: string,
		) => {
			return await this.siftService.transaction({
				$user_id: fan.id.toString(),
				$user_email: fan.email,
				$amount: feesOutput.totalAmount.getAmount() * 10000,
				$currency_code: "USD",
				$order_id: orderId,
				$transaction_id: videoCallPurchase.id.toString(),
				$transaction_type: "$sale",
				$transaction_status: status,
				$ip: request.ip,
				$seller_user_id: creator.id.toString(),
				$billing_address: {
					$name:
						customerPaymentProfile.billTo.firstName +
						" " +
						customerPaymentProfile.billTo.lastName,
					$address_1: customerPaymentProfile.billTo.address,
					$city: customerPaymentProfile.billTo.city,
					$region: customerPaymentProfile.billTo.state,
					$country: customerPaymentProfile.billTo.country,
					$zipcode: customerPaymentProfile.billTo.zip,
				},
				$payment_method: {
					$payment_type: "$credit_card",
					$payment_gateway: "$authorizenet",
					$account_holder_name:
						customerPaymentProfile.billTo.firstName +
						" " +
						customerPaymentProfile.billTo.lastName,
					$card_last4:
						customerPaymentProfile.payment.creditCard.cardNumber.slice(
							-4,
						),
					$verification_status: "$success",
				},
				$browser: {
					$user_agent: request.headers["user-agent"] ?? "",
					$accept_language: request.headers["accept-language"] ?? "",
				},
			});
		};

		const response = await siftTransaction("$pending");

		const hasBadPaymentAbuseDecision =
			response.score_response.workflow_statuses.some((workflow) =>
				workflow.history.some(
					(historyItem) =>
						historyItem.config.decision_id ===
						"looks_bad_payment_abuse",
				),
			);

		if (hasBadPaymentAbuseDecision) {
			await this.prisma.videoCallPurchase.update({
				where: { id: videoCallPurchase.id },
				data: {
					status: "Failed",
					error: "Transaction flagged as fraudulent.",
				},
			});

			await siftTransaction("$failure");

			throw APIErrors.PAYMENT_FAILED(
				"Failed because of fraud detection, if you believe this is an error contact support.",
			);
		}

		const paymentResponse =
			await this.authorizeNetService.authorizeCreditCard({
				customerProfileId: customerProfile.profile.customerProfileId,
				customerPaymentProfileId:
					customerPaymentProfile.customerPaymentProfileId,
				description: `Video Call for ${fan.username} with ${creator.displayName}`,
				amount: feesOutput.totalAmount.getAmount(),
				merchantData: {
					userId: fan.id.toString(),
					transactionId: videoCallPurchase.id.toString(),
				},
			});

		if (paymentResponse.getMessages().getResultCode() !== "Ok") {
			await this.prisma.videoCallPurchase.update({
				where: { id: videoCallPurchase.id },
				data: {
					status: "Failed",
					error: paymentResponse
						.getMessages()
						.getMessage()[0]
						.getText(),
				},
			});

			await siftTransaction(
				"$failure",
				paymentResponse.transactionResponse.transId,
			);

			throw APIErrors.PAYMENT_FAILED(
				paymentResponse.getMessages().getMessage()[0].getText(),
			);
		}

		await this.prisma.videoCallPurchase.update({
			where: { id: videoCallPurchase.id },
			data: {
				status: "Submitted",
				transactionId: paymentResponse
					.getTransactionResponse()
					?.getTransId(),
			},
		});

		const POLL_INTERVAL = 1000;
		const MAX_DURATION = 60000;

		const startDateTime = Date.now();

		for await (const _ of setInterval(POLL_INTERVAL)) {
			const videoCallPurchaseStatus =
				await this.prisma.videoCallPurchase.findUnique({
					where: { id: videoCallPurchase.id },
					select: { status: true },
				});

			if (videoCallPurchaseStatus?.status === TransactionStatus.Pending) {
				clearInterval(POLL_INTERVAL);
				return;
			}

			if (Date.now() - startDateTime > MAX_DURATION) {
				clearInterval(POLL_INTERVAL);
				throw APIErrors.PAYMENT_FAILED(
					"Transaction processing took too long. Please check back later.",
				);
			}
		}
	}

	async purchaseVideoCall(
		session: Session,
		request: FastifyRequest,
		meetingId: string,
		profile: Profile,
	) {
		const videoCallPurchase = await this.prisma.videoCallPurchase.findFirst(
			{
				where: {
					creatorId: profile.id,
					status: TransactionStatus.Pending,
					meetingId: BigInt(meetingId),
				},
				orderBy: { createdAt: "desc" },
				include: {
					fan: true,
					creator: true,
					paymentMethod: true,
				},
			},
		);

		if (
			!videoCallPurchase?.transactionId ||
			!videoCallPurchase.paymentMethod
		) {
			return APIErrors.TRANSACTION_NOT_FOUND;
		}

		const customerProfile =
			await this.authorizeNetService.fetchCustomerProfile(
				videoCallPurchase.paymentMethod.token,
			);

		if (customerProfile.getMessages().getResultCode() !== "Ok") {
			return APIErrors.PAYMENT_METHOD_FETCH_FAILED(
				customerProfile.getMessages().getMessage()[0].getText(),
			);
		}

		const customerPaymentProfile =
			customerProfile.profile.paymentProfiles.find(
				(profile: any) =>
					profile.customerPaymentProfileId ===
					videoCallPurchase.paymentProfileId,
			);

		if (!customerPaymentProfile) {
			return APIErrors.PAYMENT_METHOD_NOT_FOUND;
		}

		if (!customerProfile) {
			return APIErrors.NO_PAYMENT_METHOD_FOUND;
		}

		const siftTransaction = async (
			status: "$success" | "$failure" | "$pending",
			orderId?: string,
		) => {
			return await this.siftService.transaction({
				$user_id: videoCallPurchase.fan.id.toString(),
				$user_email: videoCallPurchase.fan.email,
				$amount: videoCallPurchase.amount * 10000,
				$currency_code: "USD",
				$order_id: orderId,
				$transaction_id: videoCallPurchase.id.toString(),
				$transaction_type: "$sale",
				$transaction_status: status,
				$ip: request.ip,
				$seller_user_id: videoCallPurchase.creator.id.toString(),
				$billing_address: {
					$name:
						customerPaymentProfile.billTo.firstName +
						" " +
						customerPaymentProfile.billTo.lastName,
					$address_1: customerPaymentProfile.billTo.address,
					$city: customerPaymentProfile.billTo.city,
					$region: customerPaymentProfile.billTo.state,
					$country: customerPaymentProfile.billTo.country,
					$zipcode: customerPaymentProfile.billTo.zip,
				},
				$payment_method: {
					$payment_type: "$credit_card",
					$payment_gateway: "$authorizenet",
					$account_holder_name:
						customerPaymentProfile.billTo.firstName +
						" " +
						customerPaymentProfile.billTo.lastName,
					$card_last4:
						customerPaymentProfile.payment.creditCard.cardNumber.slice(
							-4,
						),
					$verification_status: "$success",
				},
				$browser: {
					$user_agent: request.headers["user-agent"] ?? "",
					$accept_language: request.headers["accept-language"] ?? "",
				},
			});
		};

		const paymentResponse =
			await this.authorizeNetService.capturePreviouslyAuthorizedAmount({
				transactionId: videoCallPurchase.transactionId,
				description: `Video Call for ${videoCallPurchase.fan.username} with ${videoCallPurchase.creator.displayName}`,
				amount: videoCallPurchase.amount,
				merchantData: {
					userId: videoCallPurchase.fan.id.toString(),
					transactionId: videoCallPurchase.id.toString(),
				},
			});

		if (paymentResponse.getMessages().getResultCode() !== "Ok") {
			await this.prisma.videoCallPurchase.update({
				where: { id: videoCallPurchase.id },
				data: {
					status: "Failed",
					error: paymentResponse
						.getMessages()
						.getMessage()[0]
						.getText(),
				},
			});

			await siftTransaction(
				"$failure",
				paymentResponse.transactionResponse.transId,
			);

			return APIErrors.PAYMENT_FAILED(
				paymentResponse.getMessages().getMessage()[0].getText(),
			);
		}

		const POLL_INTERVAL = 1000;
		const MAX_DURATION = 60000;

		const startDateTime = Date.now();

		for await (const _ of setInterval(POLL_INTERVAL)) {
			const videoCallPurchaseStatus =
				await this.prisma.videoCallPurchase.findUnique({
					where: { id: videoCallPurchase.id },
					select: { status: true },
				});

			if (
				videoCallPurchaseStatus?.status === TransactionStatus.Successful
			) {
				clearInterval(POLL_INTERVAL);
				return;
			}

			if (Date.now() - startDateTime > MAX_DURATION) {
				clearInterval(POLL_INTERVAL);
				return APIErrors.PAYMENT_FAILED(
					"Transaction processing took too long. Please check back later.",
				);
			}
		}
	}
}
