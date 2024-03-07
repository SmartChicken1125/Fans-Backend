import { Static, Type } from "@sinclair/typebox";
import { assert, Equals } from "tsafe";
import { LinkParams, StoryCreateReqBody } from "./schemas.js";

export const StoryCreateReqBodyValidator = Type.Object({
	mediaId: Type.String(),
	storyUrls: Type.Optional(
		Type.Array(
			Type.Object({
				url: Type.String(),
				pointX: Type.Number(),
				pointY: Type.Number(),
			}),
		),
	),
	storyTags: Type.Optional(
		Type.Array(
			Type.Object({
				userId: Type.String(),
				color: Type.String(),
				pointX: Type.Number(),
				pointY: Type.Number(),
			}),
		),
	),
	storyTexts: Type.Optional(
		Type.Array(
			Type.Object({
				text: Type.String(),
				color: Type.String(),
				font: Type.String(),
				pointX: Type.Number(),
				pointY: Type.Number(),
			}),
		),
	),
});

assert<
	Equals<Static<typeof StoryCreateReqBodyValidator>, StoryCreateReqBody>
>();

export const LinkParamsValidator = Type.Object({
	link: Type.String(),
});

assert<Equals<Static<typeof LinkParamsValidator>, LinkParams>>();
