import { Static, Type } from "@sinclair/typebox";
import { assert, Equals } from "tsafe";
import {
	AddCreatorReqBody,
	GetUserlistQuery,
	UserlistCreateReqBody,
	UserlistUpdateReqBody,
} from "./schemas.js";

export const UserlistCreateReqBodyValidator = Type.Object({
	title: Type.String(),
	creators: Type.Array(Type.String()),
});
assert<
	Equals<Static<typeof UserlistCreateReqBodyValidator>, UserlistCreateReqBody>
>();

export const UserlistUpdateReqBodyValidator = Type.Object({
	title: Type.Optional(Type.String()),
	enabled: Type.Optional(Type.Boolean()),
	creators: Type.Optional(Type.Array(Type.String())),
});
assert<
	Equals<Static<typeof UserlistUpdateReqBodyValidator>, UserlistUpdateReqBody>
>();

export const AddCreatorReqBodyValidator = Type.Object({
	creatorId: Type.String({ format: "snowflake" }),
});
assert<Equals<Static<typeof AddCreatorReqBodyValidator>, AddCreatorReqBody>>();

export const GetUserlistQueryValidator = Type.Object({
	page: Type.Optional(Type.Number()),
	size: Type.Optional(Type.Number()),
	enabled: Type.Optional(Type.Boolean()),
});

assert<Equals<Static<typeof GetUserlistQueryValidator>, GetUserlistQuery>>();
