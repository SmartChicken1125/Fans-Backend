import {
	FanReferral,
	OAuth2LinkedAccount,
	Profile,
	StoryViewer,
	User,
} from "@prisma/client";
import { Injectable } from "async-injection";
import { FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import crypto from "node:crypto";
import geoip from "fast-geoip";
import lodash from "lodash";

import { authAPIErrors } from "../APIErrors/auth.js";
import { genericAPIErrors } from "../APIErrors/generic.js";
import { Signer, TimestampSigner } from "../itsdangerous/index.js";
import PrismaService from "./PrismaService.js";
import RedisService from "./RedisService.js";

interface SessionPayload {
	version: number;
	userId: string;
	ip: string | null;
	userAgent: string | null;
	country: string | null;
}

interface LoginInfo {
	ip: string | null;
	userAgent: string | null;
	country: string | null;
}

@Injectable()
export class Session {
	#redis: RedisService;
	#signer: Signer;
	#loginInfo: LoginInfo | null;
	#cachedUserObject?: User;
	#cachedProfileObject?: Profile;
	sessionId: string;
	userId: string;

	constructor(
		redis: RedisService,
		signer: Signer,
		sessionId: string,
		payload: SessionPayload,
	) {
		this.#redis = redis;
		this.#signer = signer;
		this.#loginInfo = null;
		payload = this.#upgradePayload(payload);

		this.sessionId = sessionId;
		this.userId = payload.userId;

		this.setLoginInfo(payload);

		this.save();
	}

	#upgradePayload(payload: SessionPayload): SessionPayload {
		if (payload.version === 2) {
			return payload;
		}
		if (payload.version === 1) {
			return {
				...payload,
				version: 2,
				ip: null,
				userAgent: null,
				country: null,
			};
		}

		throw new Error("Invalid payload version");
	}

	setLoginInfo(loginInfo: LoginInfo) {
		this.#loginInfo = {
			...this.#loginInfo,
			...lodash.pick(loginInfo, ["ip", "userAgent", "country"]),
		};
	}

	getLoginInfo(): LoginInfo | null {
		return this.#loginInfo && { ...this.#loginInfo };
	}

	save() {
		return this.#redis.set(
			`sessions:${this.sessionId}`,
			JSON.stringify({
				version: 2,
				userId: this.userId,
				ip: this.#loginInfo?.ip,
				userAgent: this.#loginInfo?.userAgent,
				country: this.#loginInfo?.country,
			}),
			"EX",
			SessionManagerService.MAX_AGE,
		);
	}

	destroy() {
		return this.#redis.del(`sessions:${this.sessionId}`);
	}

	async getAllSessionIds(): Promise<string[]> {
		const keys = await this.getAllSessionKeys();
		return keys.map((key) => key.replace("sessions:", ""));
	}

	private async getAllSessionKeys(): Promise<string[]> {
		let cur = "0";
		const sessions: string[] = [];

		for (;;) {
			const [newCur, sessionKeys] = await this.#redis.scan(
				cur,
				"MATCH",
				`sessions:${this.userId}.*`,
			);
			cur = newCur;

			if (sessionKeys.length > 0) sessions.push(...sessionKeys);
			if (cur === "0") break;
		}

		return sessions;
	}

	async destroyOtherSessions() {
		const sessionKeys = await this.getAllSessionKeys();
		const currentSessionKey = `sessions:${this.sessionId}`;

		await this.#redis.del(
			...sessionKeys.filter((key) => key !== currentSessionKey),
		);
	}

	createToken(): string {
		return this.#signer.sign(this.sessionId);
	}

	async getUser(prisma: PrismaService): Promise<User> {
		if (this.#cachedUserObject) {
			return this.#cachedUserObject;
		}

		const user = await prisma.user.findFirstOrThrow({
			where: { id: BigInt(this.userId) },
		});

		this.#cachedUserObject = user;

		return user;
	}
	async getUserWithProfile(prisma: PrismaService): Promise<
		User & {
			profile?: Profile | null;
			storyViewers?: StoryViewer[] | null;
			linkedAccounts: OAuth2LinkedAccount[] | null;
			fanReferrals: FanReferral[] | null;
		}
	> {
		const user = await prisma.user.findFirstOrThrow({
			where: { id: BigInt(this.userId) },
			include: {
				profile: true,
				storyViewers: true,
				linkedAccounts: true,
				fanReferrals: true,
			},
		});

		return user;
	}

	async getProfile(prisma: PrismaService): Promise<Profile | null> {
		if (this.#cachedProfileObject) {
			return this.#cachedProfileObject;
		}

		const profile = await prisma.profile.findFirst({
			where: { userId: BigInt(this.userId) },
		});

		this.#cachedProfileObject = profile || undefined;

		return profile;
	}
}

@Injectable()
class SessionManagerService {
	#prisma: PrismaService;
	#redis: RedisService;
	#signer: Signer;
	#fingerprintSigner: TimestampSigner;

	static MAX_AGE = 2592000;

	/**
	 * A request-pre handler that resolves the session token from the request and puts it in the request object.
	 */
	sessionPreHandler: preHandlerAsyncHookHandler;

	/**
	 * A request-pre handler that checks if the user is authenticated and if not, returns a 401.
	 */
	requireAuthHandler: preHandlerAsyncHookHandler;

	requireProfileHandler: preHandlerAsyncHookHandler;

	constructor(prisma: PrismaService, redis: RedisService) {
		if (!process.env.SECRET_KEY) {
			throw new Error("Missing SECRET_KEY");
		}

		this.#prisma = prisma;
		this.#redis = redis;
		this.#signer = new Signer(process.env.SECRET_KEY, {
			digestMethod: "sha3-256",
		});
		this.#fingerprintSigner = new TimestampSigner(
			"we just want somewhat immune to tampering fingerprints ih4wtu0dwc2Z9Yfn",
			{
				digestMethod: "sha3-224",
			},
		);

		this.#createHandlers();
	}

	#createHandlers() {
		this.sessionPreHandler = async (request, reply) => {
			const token = request.headers["authorization"];
			if (!token) {
				return;
			}

			try {
				request.session = await this.getSessionFromToken(token);
			} catch {
				request.session = undefined;
			}
		};

		this.requireAuthHandler = async (request, reply) => {
			if (!request.session) {
				reply.sendError(authAPIErrors.UNAUTHORIZED);
			}
		};

		this.requireProfileHandler = async (request, reply) => {
			if (!request.session) {
				reply.sendError(authAPIErrors.UNAUTHORIZED);
			}
			const profile = await request.session
				?.getProfile(this.#prisma)
				.catch(() => null);

			if (!profile) {
				reply.sendError(
					genericAPIErrors.INVALID_REQUEST(
						"You don't have active profile yet!",
					),
				);
			}
		};
	}

	/**
	 * @param sessionId The id of the session
	 * @returns Session or undefined if session or token is invalid or has expired.
	 */
	async getSessionFromId(sessionId: string): Promise<Session | undefined> {
		const session = await this.#redis.get(`sessions:${sessionId}`);
		if (!session) {
			return undefined;
		}

		return new Session(
			this.#redis,
			this.#signer,
			sessionId,
			JSON.parse(session),
		);
	}

	/**
	 * @param token The authorization token
	 * @returns Session or undefined if session or token is invalid or has expired.
	 */
	async getSessionFromToken(token: string): Promise<Session | undefined> {
		const sessionId = this.#signer.unsign(token);

		if (!sessionId) return undefined;

		return this.getSessionFromId(sessionId);
	}

	/**
	 * Creates a session.
	 * @param id The user ID to create session for.
	 * @param request Request which initiated session creation.
	 */
	async createSessionForUser(
		id: string,
		request?: FastifyRequest,
	): Promise<Session> {
		const sessionKey = crypto.randomBytes(24).toString("base64url");
		const sessionId = `${id.toString()}.${sessionKey}`;

		const ip = request?.ip || null;
		const userAgent = request?.headers["user-agent"] || null;
		let country = null;
		if (request) {
			const geo = await geoip.lookup(request.ip);
			if (geo) {
				country = geo.country;
			}
		}

		const payload: SessionPayload = {
			version: 2,
			userId: id,
			ip,
			userAgent,
			country,
		};

		const session = new Session(
			this.#redis,
			this.#signer,
			sessionId,
			payload,
		);

		return session;
	}

	/**
	 * Destroys all sessions for a specified user.
	 * @param id The user ID to destroy sessions for.
	 */
	async destroySessionsForUser(id: string) {
		let cur = "0";
		for (;;) {
			const [newCur, sessionKeys] = await this.#redis.scan(
				cur,
				"MATCH",
				`sessions:${id}.*`,
			);
			cur = newCur;

			if (sessionKeys.length > 0) await this.#redis.del(...sessionKeys);
			if (cur === "0") break;
		}
	}
}

export default SessionManagerService;
