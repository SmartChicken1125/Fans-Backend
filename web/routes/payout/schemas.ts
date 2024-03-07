// This file is supposed to be synced between frontend and backend
// frontend: helper/endpoints/payout/schemas.ts
// backend: web/routes/payout/schemas.ts

import { IPayoutLog, IStripeForm } from "../../CommonAPISchemas.js";

export interface PayoutMethodReqBody {
	country: string;
	state: string;
	city: string;
	street: string;
	unit?: string;
	zip: string;

	entityType: string;
	usCitizenOrResident?: boolean;

	firstName?: string;
	lastName?: string;
	company?: string;

	payoutMethod: string;

	revolut?: string;
	payoneer?: string;

	routingNumber?: string;
	accountNumber?: string;

	iban?: string;
	swift?: string;

	paypalEmail?: string;

	bankInfo?: IStripeForm;
}

export interface GetPayoutMethodReqBody {
	id: string;
}

export interface PutPayoutMethodReqBody {
	id: string;
}

export interface DeletePayoutMethodReqBody {
	id: string;
}

export interface PayoutScheduleResBody {
	mode: string;
	threshold?: number;
	maxPayout: number;
	totalPayoutAmount: number;
}

export interface UpdatePayoutScheduleReqBody {
	mode: string;
	threshold?: number;
}

export type PayoutLogReqQuery = {
	page: number;
	size?: number;
	filter?: string;
	orderBy?: string;
};

export type PayoutLogRespBody = IPayoutLog;

export interface PayoutLogsRespBody {
	payoutLogs: PayoutLogRespBody[];
	page: number;
	size: number;
	total: number;
}
