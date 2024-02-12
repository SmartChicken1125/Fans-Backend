import { ErrorSource, errorCode } from "../../common/APIErrors/index.js";

export const reviewAPIErrors = {
	REVIEW_ALREADY_EXISTS: {
		status: 400,
		data: {
			code: errorCode(ErrorSource.Review, 1),
			message: "Review already exists.",
		},
	},
	REVIEW_SELF: {
		status: 400,
		data: {
			code: errorCode(ErrorSource.Review, 2),
			message: "You cannot leave review for yourself.",
		},
	},
};
