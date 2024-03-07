import { preHandlerAsyncHookHandler } from "fastify";
import { genericAPIErrors } from "../APIErrors/generic.js";

/**
 * A simple pre-handler that only allows request to pass if NODE_ENV is not set to "production".
 * If not, it will return a DEVELOPMENT_ONLY error.
 */
export const devOnlyCheckMiddleware: preHandlerAsyncHookHandler = async (
	_request,
	reply,
) => {
	if (process.env.NODE_ENV === "production") {
		return reply.sendError(genericAPIErrors.DEVELOPMENT_ONLY);
	}
};
