import { Static, Type } from "@sinclair/typebox";
import { assert, Equals } from "tsafe";
import { StoryCreateReqBody } from "./schemas.js";

export const StoryCreateReqBodyValidator = Type.Object({
	mediaId: Type.String(),
	storyUrls: Type.Array(
		Type.Object({
			url: Type.String(),
			pointX: Type.Number(),
			pointY: Type.Number(),
		}),
	),
	storyTags: Type.Array(
		Type.Object({
			creatorId: Type.String(),
			color: Type.String(),
			pointX: Type.Number(),
			pointY: Type.Number(),
		}),
	),
});

assert<
	Equals<Static<typeof StoryCreateReqBodyValidator>, StoryCreateReqBody>
>();
