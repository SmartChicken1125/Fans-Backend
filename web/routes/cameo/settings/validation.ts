import { Static, Type } from "@sinclair/typebox";
import { assert, Equals } from "tsafe";
import {
	CameoContentType,
	CameoSettingsProgress,
	CameoVolumeTimeUnit,
} from "@prisma/client";
import { CameoPreviewUploadParams, UpdateCameoSettings } from "./schemas.js";

export const UpdateCameoPreferencesValidator = Type.Object({
	volumeLimit: Type.Optional(
		Type.Object({
			unit: Type.Union([
				Type.Literal(CameoVolumeTimeUnit.Daily),
				Type.Literal(CameoVolumeTimeUnit.Weekly),
				Type.Literal(CameoVolumeTimeUnit.Monthly),
			]),
			amount: Type.Union([Type.Integer(), Type.Null()]),
		}),
	),
	fulfillmentTime: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
	description: Type.Optional(Type.String()),
	sexualContentEnabled: Type.Optional(Type.Boolean()),
	contentTypes: Type.Optional(
		Type.Array(
			Type.Union([
				Type.Literal(CameoContentType.Acting),
				Type.Literal(CameoContentType.Advice),
				Type.Literal(CameoContentType.Roast),
				Type.Literal(CameoContentType.EighteenPlus),
				Type.Literal(CameoContentType.Shoutout),
				Type.Literal(CameoContentType.EighteenPlusSexual),
			]),
			{ uniqueItems: true },
		),
	),
	customContentType: Type.Optional(Type.String()),
	agreedToTerms: Type.Optional(Type.Boolean()),
	notificationNewRequests: Type.Optional(Type.Boolean()),
	notificationPendingVideos: Type.Optional(Type.Boolean()),
	notificationCancelledVideos: Type.Optional(Type.Boolean()),
	notificationCompletedRequests: Type.Optional(Type.Boolean()),
	notificationsByEmail: Type.Optional(Type.Boolean()),
	notificationsByPhone: Type.Optional(Type.Boolean()),
	customVideoEnabled: Type.Optional(Type.Boolean()),
	showReviews: Type.Optional(Type.Boolean()),
	progress: Type.Optional(
		Type.Union([
			Type.Literal(CameoSettingsProgress.None),
			Type.Literal(CameoSettingsProgress.Pricing),
			Type.Literal(CameoSettingsProgress.Content),
			Type.Literal(CameoSettingsProgress.RequestLimits),
			Type.Literal(CameoSettingsProgress.Description),
			Type.Literal(CameoSettingsProgress.Notifications),
			Type.Literal(CameoSettingsProgress.Completed),
		]),
	),
});

assert<
	Equals<Static<typeof UpdateCameoPreferencesValidator>, UpdateCameoSettings>
>();

export const CameoPreviewUploadParamsValidator = Type.Object({
	uploadId: Type.String({ format: "snowflake" }),
});

assert<
	Equals<
		Static<typeof CameoPreviewUploadParamsValidator>,
		CameoPreviewUploadParams
	>
>();
