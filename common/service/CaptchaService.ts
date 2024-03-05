import { Injectable, Injector } from "async-injection";
import { Logger } from "pino";
import APIErrors from "../../web/errors/index.js";
import { preHandlerAsyncHookHandler } from "fastify";

export abstract class BaseCaptchaProvider {
	static providerName: string;

	secretKey: string;

	public constructor(secretKey: string) {
		this.secretKey = secretKey;
	}

	/**
	 * Returns true if user response token is valid or false otherwise
	 * @param token The user response token provided by the frontend
	 * @param ip Optional, The user's IP address.
	 * @returns {Promise<boolean>} The verification status
	 */
	abstract validateResponse(token: string, ip?: string): Promise<boolean>;
}

class GoogleRecaptchaProvider extends BaseCaptchaProvider {
	static providerName = "recaptcha";

	public constructor(secretKey: string) {
		super(secretKey);
	}

	async validateResponse(token: string, ip?: string): Promise<boolean> {
		const formData = new FormData();
		formData.append("secret", this.secretKey);
		formData.append("response", token);
		if (ip) {
			formData.append("remoteip", ip);
		}

		const url = "https://www.google.com/recaptcha/api/siteverify";
		const result = await fetch(url, {
			body: formData,
			method: "POST",
		});

		const outcome = await result.json();
		return outcome.success;
	}
}

class TurnstileProvider extends BaseCaptchaProvider {
	static providerName = "turnstile";

	public constructor(secretKey: string) {
		super(secretKey);
	}

	async validateResponse(token: string, ip?: string): Promise<boolean> {
		const formData = new FormData();
		formData.append("secret", this.secretKey);
		formData.append("response", token);
		if (ip) {
			formData.append("remoteip", ip);
		}

		const url = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
		const result = await fetch(url, {
			body: formData,
			method: "POST",
		});

		const outcome = await result.json();
		return outcome.success;
	}
}

@Injectable()
class CaptchaService {
	readonly #providers: Map<string, BaseCaptchaProvider>;

	requireCaptchaHandler: preHandlerAsyncHookHandler;

	constructor() {
		this.#providers = new Map();

		this.#createHandlers();
	}

	#createHandlers() {
		this.requireCaptchaHandler = async (request, reply) => {
			let isValid = false;
			for (const [providerName, provider] of this.#providers) {
				const captcha = request.headers[`captcha-${providerName}`];
				const captchaString = Array.isArray(captcha)
					? captcha[0]
					: captcha;

				if (captchaString) {
					const status = await provider.validateResponse(
						captchaString,
						request.ip,
					);
					if (!status) {
						return reply.sendError(APIErrors.INVALID_CAPTCHA);
					}

					isValid = true;
				}
			}

			// At least one captcha should be valid
			if (this.canValidate() && !isValid) {
				return reply.sendError(APIErrors.INVALID_CAPTCHA);
			}
		};
	}

	registerProvider(name: string, provider: BaseCaptchaProvider) {
		this.#providers.set(name, provider);
	}

	getProvider(name: string): BaseCaptchaProvider | undefined {
		return this.#providers.get(name);
	}

	canValidate(): boolean {
		return this.#providers.size > 0;
	}
}

export async function captchaFactory(
	injector: Injector,
): Promise<CaptchaService> {
	const logger = await injector.resolve<Logger>("logger");
	const captcha = new CaptchaService();
	const providers = [GoogleRecaptchaProvider, TurnstileProvider];

	for (const Provider of providers) {
		const secretKeyEnv = `CAPTCHA_${Provider.providerName.toUpperCase()}_SECRET_KEY`;
		const secretKey = process.env[secretKeyEnv];

		if (!secretKey) {
			logger.warn(
				`Captcha provider ${Provider.providerName} is not configured`,
			);
			continue;
		}

		const provider = new Provider(secretKey);

		captcha.registerProvider(Provider.providerName, provider);
	}

	return captcha;
}

export default CaptchaService;
