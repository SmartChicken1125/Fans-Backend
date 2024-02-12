import { Static, Type } from "@sinclair/typebox";
import { assert, Equals } from "tsafe";
import {
	CreateCustomVideoOrderBody,
	CreateCustomVideoOrderReview,
	OrdersQuery,
	UpdateCustomVideoUpload,
} from "./schemas.js";

export const CreateCustomVideoOrderBodyValidator = Type.Object({
	creatorId: Type.String(),
	duration: Type.Integer({ minimum: 60, maximum: 3 * 60 * 60 }),
	instructions: Type.String(),
	recipientName: Type.Optional(Type.String()),
	recipientPronoun: Type.Optional(
		Type.Union([
			Type.Literal("He"),
			Type.Literal("She"),
			Type.Literal("They"),
		]),
	),
	paymentToken: Type.Optional(Type.String()),
});
assert<
	Equals<
		Static<typeof CreateCustomVideoOrderBodyValidator>,
		CreateCustomVideoOrderBody
	>
>();

export const OrdersQueryValidator = Type.Object({
	creatorId: Type.Optional(Type.String()),
	before: Type.Optional(Type.String()),
	after: Type.Optional(Type.String()),
	status: Type.Optional(
		Type.Union([
			Type.Literal("pending"),
			Type.Literal("accepted"),
			Type.Literal("cancelled"),
			Type.Literal("declined"),
			Type.Literal("completed"),
		]),
	),
	sort: Type.Optional(Type.String()),
});
assert<Equals<Static<typeof OrdersQueryValidator>, OrdersQuery>>();

export const UpdateCustomVideoUploadValidator = Type.Object({
	uploadId: Type.String(),
});
assert<
	Equals<
		Static<typeof UpdateCustomVideoUploadValidator>,
		UpdateCustomVideoUpload
	>
>();

export const CreateCustomVideoOrderReviewValidator = Type.Object({
	score: Type.Optional(Type.Integer({ minimum: 0, maximum: 5 })),
	review: Type.String(),
});
assert<
	Equals<
		Static<typeof CreateCustomVideoOrderReviewValidator>,
		CreateCustomVideoOrderReview
	>
>();
