import { ErrorSource, errorCode } from "../../common/APIErrors/index.js";

export const chatAPIErrors = {
	CHANNEL_NOT_FOUND: {
		status: 404,
		data: {
			code: errorCode(ErrorSource.Chat, 1),
			message: "Channel not found.",
		},
	},
	VIDEO_CALL_IN_PROGRESS: {
		status: 400,
		data: {
			code: errorCode(ErrorSource.Chat, 2),
			message: "Video Call is already in progress.",
		},
	},
	VIDEO_CALL_INTERNAL_ERROR: {
		status: 500,
		data: {
			code: errorCode(ErrorSource.Chat, 3),
			message: "Video Call error.",
		},
	},
};
