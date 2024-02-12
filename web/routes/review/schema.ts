import { IReview } from "../../CommonAPISchemas.js";

export type ReviewResBody = IReview;

export interface ReviewsResBody {
	reviews: ReviewResBody[];
	page: number;
	size: number;
	total: number;
}

export interface ReviewCreateReqBody {
	text?: string;
	score: number;
	creatorId: string;
}
