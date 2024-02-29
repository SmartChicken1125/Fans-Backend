import { Static, Type } from "@sinclair/typebox";
import { Equals, assert } from "tsafe";
import { ReviewCreateReqBody } from "./schema.js";

export const ReviewCreateReqBodyValidator = Type.Object({
	text: Type.Optional(Type.String()),
	score: Type.Number(),
	creatorId: Type.String(),
	tip: Type.Number(),
});

assert<
	Equals<Static<typeof ReviewCreateReqBodyValidator>, ReviewCreateReqBody>
>();
