import { ErrorSource, errorCode } from "../../common/APIErrors/index.js";

export const cameoAPIErrors = {
	CAMEO_DURATION_NOT_FOUND: {
		status: 404,
		data: {
			code: errorCode(ErrorSource.Cameo, 1),
			message: "No duration with the provided id found",
		},
	},
	CAMEO_DURATION_CONFLICT: {
		status: 400,
		data: {
			code: errorCode(ErrorSource.Cameo, 2),
			message: "Duration already exists",
		},
	},
	CAMEO_SETTINGS_NOT_FOUND: {
		status: 404,
		data: {
			code: errorCode(ErrorSource.Cameo, 3),
			message: "Cameo settings not found",
		},
	},
	INVALID_CAMEO_HOST: (id: string) => ({
		status: 400,
		data: {
			code: errorCode(ErrorSource.Cameo, 4),
			message: `Cannot order custom video for the provided host: ${id}`,
		},
	}),
	CAMEO_ORDER_NOT_FOUND: {
		status: 404,
		data: {
			code: errorCode(ErrorSource.Cameo, 5),
			message: "Cameo order not found",
		},
	},
	INVALID_CAMEO_ORDER_STATE: {
		status: 400,
		data: {
			code: errorCode(ErrorSource.Cameo, 6),
			message: "Invalid cameo order state",
		},
	},
	CAMEO_REACHED_ORDER_LIMIT: {
		status: 400,
		data: {
			code: errorCode(ErrorSource.Cameo, 7),
			message:
				"Custom video order limit reached for the current creator. Please try again later.",
		},
	},
	CAMEO_DISABLED_BY_CREATOR: {
		status: 400,
		data: {
			code: errorCode(ErrorSource.Cameo, 8),
			message:
				"Cannot order custom video. Creator has disabled this feature.",
		},
	},
};
