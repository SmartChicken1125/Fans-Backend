import { Static, Type } from "@sinclair/typebox";
import { assert, Equals } from "tsafe";
import {
	PayoutMethodReqBody,
	UpdatePayoutScheduleReqBody,
	PayoutLogReqQuery,
	GetPayoutMethodReqBody,
	PutPayoutMethodReqBody,
	DeletePayoutMethodReqBody,
} from "./schemas.js";

export const PayoutMethodReqBodyValidator = Type.Object({
	country: Type.String(),
	state: Type.String(),
	city: Type.String(),
	street: Type.String(),
	unit: Type.Optional(Type.String()),
	zip: Type.String(),
	entityType: Type.String(),
	usCitizenOrResident: Type.Optional(Type.Boolean()),
	firstName: Type.Optional(Type.String()),
	lastName: Type.Optional(Type.String()),
	company: Type.Optional(Type.String()),
	payoutMethod: Type.String(),
	revolut: Type.Optional(Type.String()),
	payoneer: Type.Optional(Type.String()),
	routingNumber: Type.Optional(Type.String()),
	accountNumber: Type.Optional(Type.String()),
	iban: Type.Optional(Type.String()),
	swift: Type.Optional(Type.String()),
	paypalEmail: Type.Optional(Type.String()),
	bankInfo: Type.Optional(
		Type.Object({
			firstName: Type.String(),
			lastName: Type.String(),
			address1: Type.String(),
			address2: Type.String(),
			city: Type.String(),
			state: Type.String(),
			zip: Type.String(),
			bankRoutingNumber: Type.String(),
			bankAccountNumber: Type.String(),
		}),
	),
});

assert<
	Equals<Static<typeof PayoutMethodReqBodyValidator>, PayoutMethodReqBody>
>();

export const GetPayoutMethodReqBodyValidator = Type.Object({
	id: Type.String({ format: "snowflake" }),
});

assert<
	Equals<
		Static<typeof GetPayoutMethodReqBodyValidator>,
		GetPayoutMethodReqBody
	>
>();

export const PutPayoutMethodReqBodyValidator = Type.Object({
	id: Type.String({ format: "snowflake" }),
});

assert<
	Equals<
		Static<typeof PutPayoutMethodReqBodyValidator>,
		PutPayoutMethodReqBody
	>
>();

export const DeletePayoutMethodReqBodyValidator = Type.Object({
	id: Type.String({ format: "snowflake" }),
});

assert<
	Equals<
		Static<typeof DeletePayoutMethodReqBodyValidator>,
		DeletePayoutMethodReqBody
	>
>();

export const UpdatePayoutScheduleReqBodyValidator = Type.Object({
	mode: Type.String(),
	threshold: Type.Optional(Type.Number()),
});

assert<
	Equals<
		Static<typeof UpdatePayoutScheduleReqBodyValidator>,
		UpdatePayoutScheduleReqBody
	>
>();

export const PayoutLogReqQueryValidator = Type.Object({
	page: Type.Number(),
	size: Type.Optional(Type.Number()),
	filter: Type.Optional(Type.String()),
	orderBy: Type.Optional(Type.String()),
});

assert<Equals<Static<typeof PayoutLogReqQueryValidator>, PayoutLogReqQuery>>();
