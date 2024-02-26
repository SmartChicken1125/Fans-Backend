import { ErrorSource, errorCode } from "../../common/APIErrors/index.js";

export const blockUserAPIErrors = {
	NOT_SUBSCRIBED: {
		status: 404,
		data: {
			code: errorCode(ErrorSource.BlockUser, 1),
			message: "This user is not subscribed you.",
		},
	},
	ALREADY_BLOCKED: {
		status: 404,
		data: {
			code: errorCode(ErrorSource.BlockUser, 2),
			message: "This user is blocked by you already.",
		},
	},
	NOT_BLOCKED: {
		status: 404,
		data: {
			code: errorCode(ErrorSource.BlockUser, 3),
			message: "This user is not blocked by you.",
		},
	},
};
