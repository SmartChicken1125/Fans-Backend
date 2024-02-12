import { PronounType } from "../../../CommonAPISchemas.js";

export interface CreateCustomVideoOrderBody {
	creatorId: string;
	duration: number;
	instructions: string;
	recipientName?: string;
	recipientPronoun?: PronounType;
	paymentToken?: string;
}

export type OrderStatus =
	| "pending"
	| "accepted"
	| "declined"
	| "cancelled"
	| "completed";

export interface OrdersQuery {
	creatorId?: string;
	before?: string;
	after?: string;
	status?: OrderStatus;
	sort?: string;
}

export interface UpdateCustomVideoUpload {
	uploadId: string;
}

export interface CreateCustomVideoOrderReview {
	score?: number;
	review: string;
}
