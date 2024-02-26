import { Static, Type } from "@sinclair/typebox";
import { assert, Equals } from "tsafe";
import { GetAvailabilityQuery, GetVideoCallPriceParams } from "./schemas.js";

export const GetAvailabilityQueryValidator = Type.Object({
	creatorId: Type.String(),
	before: Type.String(),
	after: Type.String(),
	duration: Type.Integer({ multipleOf: 15 }),
});
assert<
	Equals<Static<typeof GetAvailabilityQueryValidator>, GetAvailabilityQuery>
>();

export const GetVideoCallPriceParamsValidator = Type.Object({
	hostId: Type.String(),
	duration: Type.Integer(),
	customerPaymentProfileId: Type.Optional(Type.String()),
});
assert<
	Equals<
		Static<typeof GetVideoCallPriceParamsValidator>,
		GetVideoCallPriceParams
	>
>();
