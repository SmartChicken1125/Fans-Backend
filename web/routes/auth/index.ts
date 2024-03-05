import { FastifyPluginOptions, FastifyRequest } from "fastify";
import crypto from "node:crypto";
import pwdStrength from "pwd-strength";
import APIErrors from "../../errors/index.js";
import { isEmailValid, isUsernameValid } from "../../../common/Validation.js";
import {
	VerifyPasswordResult,
	generatePasswordHashSalt,
	verifyPassword,
} from "../../../common/auth/Hashing.js";
import { SendEmailData } from "../../../common/service/EmailerService.js";
import OAuth2Service from "../../../common/service/OAuth2Service.js";
import PrismaService from "../../../common/service/PrismaService.js";
import EmailerService from "../../../common/service/EmailerService.js";
import SessionManagerService from "../../../common/service/SessionManagerService.js";
import SnowflakeService from "../../../common/service/SnowflakeService.js";
import GemExchangeService from "../../../common/service/GemExchangeService.js";
import SiftService from "../../../common/service/SiftService.js";
import { generateUsername } from "../../../common/utils/UsernameGenerator.js";
import {
	RegisterEmailContent,
	resetPasswordEmailContent,
} from "../../../constants/email-template/Templates.js";
import { ModelConverter } from "../../models/modelConverter.js";
import { FastifyTypebox } from "../../types.js";
import {
	AuthCheckResetPasswordReqBody,
	AuthForgotPasswordReqBody,
	AuthOAuth2AuthorizeReqBody,
	AuthOAuth2AuthorizeReqParams,
	AuthOAuth2LinkListRespBody,
	AuthOAuth2LinkReqBody,
	AuthOAuth2LinkReqParams,
	AuthOAuth2LinkRespBody,
	AuthPasswordLoginReqBody,
	AuthPasswordRegisterReqBody,
	AuthResendReqBody,
	AuthResetPasswordReqBody,
	AuthUserInfoRespBody,
	AuthVerifyCodeReqBody,
	SessionIdParams,
	TokenRespBody,
} from "./schemas.js";
import {
	AuthCheckResetPasswordReqBodyValidator,
	AuthForgotPasswordReqBodyValidator,
	AuthOAuth2AuthorizeReqBodyValidator,
	AuthOAuth2AuthorizeReqParamsValidator,
	AuthOAuth2LinkReqBodyValidator,
	AuthOAuth2LinkReqParamsValidator,
	AuthPasswordLoginReqBodyValidator,
	AuthPasswordRegisterReqBodyValidator,
	AuthResendReqBodyValidator,
	AuthResetPasswordReqBodyValidator,
	AuthVerifyCodeReqBodyValidator,
	SessionIdParamValidator,
} from "./validation.js";
import RedisService from "../../../common/service/RedisService.js";
import { genOTP } from "../../../common/utils/OTPGenerator.js";
import CaptchaService from "../../../common/service/CaptchaService.js";
import { User } from "@prisma/client";
import { ISession } from "../../CommonAPISchemas.js";

const DECIMAL_TO_CENT_FACTOR = 100;

const SECONDS_IN_DAY = 24 * 60 * 60;

export default async function routes(
	fastify: FastifyTypebox,
	options: FastifyPluginOptions,
) {
	const { container } = fastify;
	const prisma = await container.resolve(PrismaService);
	const snowflake = await container.resolve(SnowflakeService);
	const sessionManager = await container.resolve(SessionManagerService);
	const oauth2 = await container.resolve(OAuth2Service);
	const gemExchange = await container.resolve(GemExchangeService);
	const emailService = await container.resolve(EmailerService);
	const siftService = await container.resolve(SiftService);
	const redis = await container.resolve(RedisService);
	const captchaService = await container.resolve(CaptchaService);

	const resetPasswordCodeKey = (code: string) => `resetPasswordCodes:${code}`;

	const validatePassword = (password: string) =>
		pwdStrength(password, {
			minNumberChars: 0,
			minUpperChars: 0,
			minLowerChars: 0,
			minSpecialChars: 0,
			minPasswordLength: 8,
		});

	const generateUsernameChecked = async () => {
		for (let i = 0; i < 10000; i++) {
			const username = generateUsername();
			const existingUser = await prisma.user.findFirst({
				where: {
					username: {
						equals: username,
						mode: "insensitive",
					},
				},
			});

			if (!existingUser) {
				return username;
			}
		}
		throw new Error("Attempts exceeded");
	};

	const siftLogin = (
		user: User | null,
		request: FastifyRequest,
		status: "$success" | "$failure",
		reason?:
			| "$account_unknown"
			| "$account_suspended"
			| "$account_disabled"
			| "$wrong_password",
	) => {
		if (!user) return;
		return siftService.login({
			$user_id: user.id.toString(),
			$user_email: user.email,
			$username: user.username,
			$ip: request.ip,
			$login_status: status,
			$failure_reason: reason,
			$browser: {
				$user_agent: request.headers["user-agent"],
				$accept_language: request.headers["accept-language"],
			},
		});
	};

	fastify.post<{ Body: AuthPasswordRegisterReqBody; Reply: TokenRespBody }>(
		"/register",
		{
			config: {
				rateLimit: {},
			},
			schema: { body: AuthPasswordRegisterReqBodyValidator },
			preHandler: [
				sessionManager.sessionPreHandler,
				captchaService.requireCaptchaHandler,
			],
		},
		async (request, reply) => {
			if (request.session) {
				return reply.sendError(APIErrors.ALREADY_AUTHORIZED);
			}

			const { email, username, password } = request.body;
			if (username != undefined && !isUsernameValid(username)) {
				return reply.sendError(APIErrors.REGISTER_INVALID_USERNAME);
			}

			const lowerCaseEmail = email.toLowerCase();

			if (!isEmailValid(lowerCaseEmail)) {
				return reply.sendError(APIErrors.REGISTER_INVALID_EMAIL);
			}

			const existingUser = await prisma.user.findFirst({
				where: {
					OR: [
						{
							email: {
								equals: lowerCaseEmail,
								mode: "insensitive",
							},
						},
						{ username: { equals: username, mode: "insensitive" } },
					],
				},
			});

			if (existingUser) {
				return reply.sendError(
					existingUser.email === lowerCaseEmail
						? APIErrors.REGISTER_EMAIL_IN_USE
						: APIErrors.TAKEN_USERNAME,
				);
			}

			const strengthCheck = validatePassword(password);
			if (!strengthCheck.success) {
				return reply.sendError(
					APIErrors.REGISTER_INVALID_PASSWORD(strengthCheck.message),
				);
			}

			await prisma.oTPCode.deleteMany({
				where: { email },
			});

			const passwordHash = await generatePasswordHashSalt(password);
			const user = await prisma.user.create({
				data: {
					id: snowflake.gen(),
					email: lowerCaseEmail,
					displayName: "",
					username,
					password: passwordHash,
					gems: { create: { id: snowflake.gen() } },
					popupStatus: { create: { id: snowflake.gen() } },
					notificationsSettings: {
						create: { id: snowflake.gen() },
					},
					verifiedAt: null,
				},
			});

			const otpCode = await prisma.oTPCode.create({
				data: {
					id: snowflake.gen(),
					code: genOTP(6),
					email: email,
					userId: user.id,
				},
			});

			const emailData: SendEmailData = {
				sender: process.env.SENDINBLUE_SENDER || "noreply@fyp.fans",
				to: [lowerCaseEmail],
				htmlContent: RegisterEmailContent(otpCode.code),
				subject: "Verify your account!",
			};
			await emailService.sendEmail(emailData);

			await siftService.createAccount({
				$user_id: user.id.toString(),
				$user_email: request.body.email,
				$ip: request.ip,
				$browser: {
					$user_agent: request.headers["user-agent"],
					$accept_language: request.headers["accept-language"],
				},
			});

			const session = await sessionManager.createSessionForUser(
				user.id.toString(),
			);

			const result: TokenRespBody = {
				token: session.createToken(),
			};

			return reply.send(result);
		},
	);

	fastify.post<{ Body: AuthPasswordLoginReqBody }>(
		"/login",
		{
			schema: { body: AuthPasswordLoginReqBodyValidator },
		},
		async (request, reply) => {
			const { email, password } = request.body;
			const user = await prisma.user.findFirst({
				where: {
					OR: [
						{
							email: {
								equals: email,
								mode: "insensitive",
							},
						},
						{
							username: {
								equals: email,
								mode: "default",
							},
						},
					],
				},
			});

			if (!user || !user.password) {
				siftLogin(user, request, "$failure", "$account_unknown");
				return reply.sendError(APIErrors.LOGIN_INVALID_CREDENTIALS);
			}

			if (user.disabled) {
				siftLogin(user, request, "$failure", "$account_suspended");
				return reply.sendError(APIErrors.USER_BANNED);
			}

			const result = await verifyPassword(password, user.password);
			if (result === VerifyPasswordResult.OK) {
				const session = await sessionManager.createSessionForUser(
					user.id.toString(),
					request,
				);
				const result: TokenRespBody = {
					token: session.createToken(),
				};
				const popupStatus = await prisma.popupStatus.findFirst({
					where: { userId: user.id },
				});
				if (popupStatus && !popupStatus?.loggedIn) {
					await prisma.popupStatus.update({
						where: { id: popupStatus.id },
						data: {
							loggedIn: true,
							showFairTransactionDialog: true,
						},
					});
				}
				siftLogin(user, request, "$success");
				return reply.send(result);
			} else {
				siftLogin(user, request, "$failure", "$wrong_password");
				return reply.sendError(APIErrors.LOGIN_INVALID_CREDENTIALS);
			}
		},
	);

	fastify.post<{ Body: {} }>(
		"/logout",
		{
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthNoVerificationHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);

			await siftService.logout({
				$user_id: user?.id.toString(),
				$browser: {
					$user_agent: request.headers["user-agent"],
					$accept_language: request.headers["accept-language"],
				},
			});
			request.session?.destroy();
			return reply.send();
		},
	);

	fastify.get(
		"/user-info",
		{
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthNoVerificationHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUserWithProfile(prisma);
			const [gemsBalance, payoutBalance] = await Promise.all([
				prisma.gemsBalance.findFirst({
					where: { userId: BigInt(session.userId) },
				}),
				user.profile
					? prisma.balance.findFirst({
							where: { profileId: BigInt(user.profile.id) },
					  })
					: null,
			]);

			let gems = 0;
			let gemsAmount = 0;
			let payoutBalanceAmount = 0;

			if (gemsBalance?.amount) {
				gems = gemExchange
					.gemExchangeBack(gemsBalance.amount)
					.getAmount();
				gemsAmount = gemsBalance.amount / DECIMAL_TO_CENT_FACTOR;
			}

			if (payoutBalance?.amount) {
				payoutBalanceAmount =
					payoutBalance.amount / DECIMAL_TO_CENT_FACTOR;
			}

			const result: AuthUserInfoRespBody = {
				...ModelConverter.toIUser(user, true),
				profile: user.profile
					? ModelConverter.toIProfile(user.profile)
					: undefined,
				viewedStoryCreators: user.storyViewers
					? user.storyViewers.map((sv) =>
							ModelConverter.toIStoryViewer(sv),
					  )
					: undefined,
				gems,
				gemsAmount,
				payoutBalance: payoutBalanceAmount,
				linkedAccounts: user.linkedAccounts
					? user.linkedAccounts.map((l) =>
							ModelConverter.toIOAuth2LinkedAccount(l),
					  )
					: undefined,
				fanReferrals: user.fanReferrals?.map((f) =>
					ModelConverter.toIFanReferral(f),
				),
			};
			return reply.send(result);
		},
	);

	fastify.post<{ Body: AuthForgotPasswordReqBody }>(
		"/forgot-password",
		{
			schema: {
				body: AuthForgotPasswordReqBodyValidator,
			},
			preHandler: [captchaService.requireCaptchaHandler],
		},
		async (request, reply) => {
			// verify user is exist
			const { email } = request.body;
			const user = await prisma.user.findFirst({
				where: {
					email: {
						equals: email,
						mode: "insensitive",
					},
				},
			});

			if (!user) {
				return reply.sendError(APIErrors.USER_NOT_FOUND);
			}

			if (user.disabled) {
				siftLogin(user, request, "$failure", "$account_suspended");
				return reply.sendError(APIErrors.USER_BANNED);
			}

			const code = crypto.randomBytes(128).toString("base64url");
			await redis.set(
				resetPasswordCodeKey(code),
				email.toLowerCase(),
				"EX",
				SECONDS_IN_DAY,
			);
			// send email for OTP code
			const emailData: SendEmailData = {
				sender: process.env.SENDINBLUE_SENDER || "support@fyp.fans",
				to: [user.email],
				htmlContent: resetPasswordEmailContent(code),
				subject: "Verify your account",
			};
			await emailService.sendEmail(emailData);
			return reply.status(202).send();
		},
	);

	fastify.post<{ Body: AuthCheckResetPasswordReqBody }>(
		"/check-reset-password",
		{
			schema: {
				body: AuthCheckResetPasswordReqBodyValidator,
			},
		},
		async (request, reply) => {
			const { code } = request.body;
			const email = await redis.get(resetPasswordCodeKey(code));
			if (!email) {
				return reply.sendError(
					APIErrors.PASSWORD_RESET_CODE_INVALID_OR_EXPIRED,
				);
			}

			return reply.send();
		},
	);

	fastify.post<{ Body: AuthResetPasswordReqBody; Reply: TokenRespBody }>(
		"/reset-password",
		{
			schema: {
				body: AuthResetPasswordReqBodyValidator,
			},
		},
		async (request, reply) => {
			const { code, password } = request.body;

			const email = await redis.get(resetPasswordCodeKey(code));
			if (!email) {
				return reply.sendError(
					APIErrors.PASSWORD_RESET_CODE_INVALID_OR_EXPIRED,
				);
			}
			const user = await prisma.user.findFirst({
				where: {
					email: {
						equals: email,
						mode: "insensitive",
					},
				},
			});

			if (!user) {
				return reply.sendError(APIErrors.USER_NOT_FOUND);
			}

			if (user.disabled) {
				siftLogin(user, request, "$failure", "$account_suspended");
				return reply.sendError(APIErrors.USER_BANNED);
			}

			const strengthCheck = validatePassword(password);
			if (!strengthCheck.success) {
				return reply.sendError(
					APIErrors.REGISTER_INVALID_PASSWORD(strengthCheck.message),
				);
			}

			await redis.del(resetPasswordCodeKey(code));

			const passwordHash = await generatePasswordHashSalt(password);
			await prisma.user.update({
				where: { id: user.id },
				data: { password: passwordHash, verifiedAt: new Date() },
			});

			await sessionManager.destroySessionsForUser(user.id.toString());
			const session = await sessionManager.createSessionForUser(
				user.id.toString(),
				request,
			);
			const result: TokenRespBody = {
				token: session.createToken(),
			};
			return reply.send(result);
		},
	);

	fastify.post<{ Body: AuthVerifyCodeReqBody }>(
		"/verify-account",
		{
			schema: {
				body: AuthVerifyCodeReqBodyValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthNoVerificationHandler,
				captchaService.requireCaptchaHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);

			const { code } = request.body;

			if (user.disabled) {
				siftLogin(user, request, "$failure", "$account_suspended");
				return reply.sendError(APIErrors.USER_BANNED);
			}

			const otp = await prisma.oTPCode.findFirst({
				where: {
					AND: [{ code }, { userId: user.id }],
				},
			});
			if (!otp) return reply.sendError(APIErrors.ITEM_NOT_FOUND("OTP"));

			// All other tokens will become verified which might be dangerous
			await session.destroyOtherSessions();

			await Promise.all([
				prisma.oTPCode.delete({
					where: { id: otp.id },
				}),
				prisma.user.update({
					where: { id: user.id },
					data: { verifiedAt: new Date() },
				}),
			]);

			return reply.send();
		},
	);

	fastify.post<{ Body: AuthResendReqBody }>(
		"/resend-verify-code",
		{
			schema: {
				body: AuthResendReqBodyValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthNoVerificationHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);

			if (user.verifiedAt != null)
				return reply.sendError(
					APIErrors.EMAIL_VERIFICATION_ALREADY_VERIFIED,
				);

			const { email } = request.body || {};
			const lowerCaseEmail = email?.toLowerCase();
			const targetEmail = lowerCaseEmail ?? user.email;

			if (targetEmail) {
				const existingUserByEmail = await prisma.user.findFirst({
					where: {
						email: { equals: targetEmail, mode: "insensitive" },
						id: { not: user.id },
					},
				});

				if (existingUserByEmail)
					return reply.sendError(APIErrors.REGISTER_EMAIL_IN_USE);
			}

			await prisma.oTPCode.deleteMany({
				where: { userId: user.id },
			});

			const otpCode = await prisma.oTPCode.create({
				data: {
					id: snowflake.gen(),
					code: genOTP(6),
					email: targetEmail ?? null,
					userId: user.id,
				},
			});

			// send email for OTP code
			const emailData: SendEmailData = {
				sender: process.env.SENDINBLUE_SENDER || "support@fyp.fans",
				to: [targetEmail],
				htmlContent: RegisterEmailContent(otpCode.code),
				subject: "Verify your account",
			};
			await emailService.sendEmail(emailData);

			return reply.send();
		},
	);

	fastify.post<{
		Params: AuthOAuth2AuthorizeReqParams;
		Body: AuthOAuth2AuthorizeReqBody;
	}>(
		"/oauth2/authorize/:provider",
		{
			schema: {
				body: AuthOAuth2AuthorizeReqBodyValidator,
				params: AuthOAuth2AuthorizeReqParamsValidator,
			},
		},
		async (request, reply) => {
			const { provider } = request.params;
			const { code, redirectUri, codeVerifier } = request.body;
			const providerInstance = oauth2.getProvider(provider);

			if (!providerInstance) {
				return reply.sendError(APIErrors.OAUTH2_INVALID_PROVIDER);
			}

			const oauthProfile = await providerInstance.getUserWithCode(
				redirectUri,
				code,
				codeVerifier,
			);

			const account = await prisma.oAuth2LinkedAccount.findFirst({
				where: {
					provider: provider,
					accountId: oauthProfile.id,
				},
			});

			if (account) {
				const user = await prisma.user.findUniqueOrThrow({
					where: { id: account.userId },
				});

				if (user.disabled) {
					siftLogin(user, request, "$failure", "$account_suspended");
					return reply.sendError(APIErrors.USER_BANNED);
				}

				account.name = oauthProfile.name;
				account.email = oauthProfile.email.toLowerCase();
				account.avatarUrl = oauthProfile.avatarUrl ?? null;
				account.accessToken = oauthProfile.accessToken;
				account.refreshToken =
					oauthProfile.refreshToken ?? account.refreshToken ?? null;

				prisma.oAuth2LinkedAccount.update({
					where: { id: account.id },
					data: account,
				});

				const session = await sessionManager.createSessionForUser(
					account.userId.toString(),
					request,
				);

				const result: TokenRespBody = {
					token: session.createToken(),
				};
				return reply.send(result);
			}

			const existingUserByEmail = await prisma.user.findFirst({
				where: {
					email: { equals: oauthProfile.email },
				},
			});

			// in this case the user can regain access to their account by using the forgot password flow
			if (existingUserByEmail) {
				return reply.sendError(APIErrors.OAUTH2_EMAIL_IN_USE);
			}

			const newUserId = snowflake.gen();
			const username = await generateUsernameChecked();

			const [user] = await prisma.$transaction([
				prisma.user.create({
					data: {
						id: newUserId,
						email: oauthProfile.email,
						username,
						displayName: oauthProfile.name,
						password: "",
						verifiedAt: new Date(),
						gems: { create: { id: snowflake.gen() } },
						popupStatus: { create: { id: snowflake.gen() } },
						notificationsSettings: {
							create: { id: snowflake.gen() },
						},
					},
				}),
				prisma.oAuth2LinkedAccount.create({
					data: {
						id: snowflake.gen(),
						provider: provider,
						accountId: oauthProfile.id,
						name: oauthProfile.name,
						email: oauthProfile.email,
						avatarUrl: oauthProfile.avatarUrl ?? null,
						accessToken: oauthProfile.accessToken,
						userId: newUserId,
					},
				}),
			]);

			const session = await sessionManager.createSessionForUser(
				user.id.toString(),
				request,
			);

			const result: TokenRespBody = { token: session.createToken() };
			await siftService.createAccount({
				$user_id: user.id.toString(),
				$user_email: oauthProfile.email,
				$ip: request.ip,
				$browser: {
					$user_agent: request.headers["user-agent"],
					$accept_language: request.headers["accept-language"],
				},
			});
			return reply.send(result);
		},
	);

	fastify.post<{
		Body: AuthOAuth2LinkReqBody;
		Params: AuthOAuth2LinkReqParams;
	}>(
		"/oauth2/link/:provider",
		{
			schema: {
				body: AuthOAuth2LinkReqBodyValidator,
				params: AuthOAuth2LinkReqParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthNoVerificationHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);
			const { provider } = request.params;
			const { redirectUri, code, codeVerifier } = request.body;
			const providerInstance = oauth2.getProvider(provider);

			if (!providerInstance) {
				return reply.sendError(APIErrors.OAUTH2_INVALID_PROVIDER);
			}

			const oauthProfile = await providerInstance.getUserWithCode(
				redirectUri,
				code,
				codeVerifier,
			);

			const account = await prisma.oAuth2LinkedAccount.findFirst({
				where: {
					provider: provider,
					accountId: oauthProfile.id,
				},
			});

			if (account) {
				return reply.sendError(APIErrors.OAUTH2_ALREADY_LINKED);
			}

			const created = await prisma.oAuth2LinkedAccount.create({
				data: {
					id: snowflake.gen(),
					provider: provider,
					accountId: oauthProfile.id,
					name: oauthProfile.name,
					email: oauthProfile.email.toLowerCase(),
					avatarUrl: oauthProfile.avatarUrl ?? null,
					accessToken: oauthProfile.accessToken,
					userId: user.id,
				},
			});

			const result: AuthOAuth2LinkRespBody = {
				linkedAccount: ModelConverter.toIOAuth2LinkedAccount(created),
			};
			return reply.send(result);
		},
	);

	fastify.delete<{
		Params: AuthOAuth2LinkReqParams;
	}>(
		"/oauth2/link/:provider",
		{
			schema: {
				params: AuthOAuth2LinkReqParamsValidator,
			},
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthNoVerificationHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);
			const { provider } = request.params;

			if (!user.password || user.password.length === 0) {
				return reply.sendError(
					APIErrors.OAUTH2_UNABLE_UNLINK_WITHOUT_PASSWORD,
				);
			}

			const linked = await prisma.oAuth2LinkedAccount.findFirst({
				where: {
					provider,
					userId: user.id,
				},
			});

			if (!linked) {
				return reply.sendError(APIErrors.OAUTH2_NOT_LINKED);
			}

			await prisma.oAuth2LinkedAccount.delete({
				where: {
					id: linked.id,
				},
			});

			return reply.send({});
		},
	);

	fastify.get(
		"/oauth2/link-list",
		{
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthNoVerificationHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const user = await session.getUser(prisma);

			const accounts = await prisma.oAuth2LinkedAccount.findMany({
				where: {
					user: { id: user.id },
				},
			});

			const accountList: AuthOAuth2LinkListRespBody = { links: {} };

			for (const account of accounts) {
				accountList.links[account.provider] = {
					id: account.id.toString(),
					accountId: account.accountId,
					email: account.email,
					name: account.name,
					avatarUrl: account.avatarUrl ?? undefined,
					linkedAt: SnowflakeService.extractDate(
						account.id,
					).toISOString(),
				};
			}

			return reply.send(accountList);
		},
	);

	fastify.get<{ Reply: ISession[] }>(
		"/sessions",
		{
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;

			const sessionIds = await session.getAllSessionIds();
			const sessions = sessionIds.map((id) => ({
				id,
				userId: session.userId,
			}));

			return reply.send(sessions);
		},
	);

	fastify.get<{ Params: SessionIdParams; Reply: ISession }>(
		"/sessions/:sessionId",
		{
			schema: { params: SessionIdParamValidator },
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const { sessionId } = request.params;

			const sessionIds = await session.getAllSessionIds();
			if (!sessionIds.includes(sessionId)) {
				return reply.sendError(APIErrors.ITEM_NOT_FOUND("Session"));
			}

			return reply.send({ id: sessionId, userId: session.userId });
		},
	);

	fastify.delete<{ Params: SessionIdParams; Reply: ISession }>(
		"/sessions/:sessionId",
		{
			schema: { params: SessionIdParamValidator },
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			const { sessionId } = request.params;

			const sessionIds = await session.getAllSessionIds();
			if (!sessionIds.includes(sessionId)) {
				return reply.sendError(APIErrors.ITEM_NOT_FOUND("Session"));
			}

			const toDelete = await sessionManager.getSessionFromId(sessionId);
			if (!toDelete) {
				return reply.sendError(APIErrors.ITEM_NOT_FOUND("Session"));
			}

			await toDelete.destroy();

			return reply.send({ id: sessionId, userId: session.userId });
		},
	);

	fastify.delete(
		"/sessions/other",
		{
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			await session.destroyOtherSessions();

			return reply.send();
		},
	);

	fastify.get<{ Reply: ISession }>(
		"/sessions/current",
		{
			preHandler: [
				sessionManager.sessionPreHandler,
				sessionManager.requireAuthHandler,
			],
		},
		async (request, reply) => {
			const session = request.session!;
			return reply.send({
				id: session.sessionId,
				userId: session.userId,
			});
		},
	);
}
