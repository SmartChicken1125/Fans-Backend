import { CameoContentType } from "@prisma/client";
import { CameoSettingsProgressType } from "../../../CommonAPISchemas.js";

export interface CameoSettings {
	volumeLimit: {
		unit: "Daily" | "Weekly" | "Monthly";
		amount: number | null;
	};
	fulfillmentTime: number | null; // hours
	description: string;
	sexualContentEnabled: boolean;
	contentTypes: (typeof CameoContentType)[keyof typeof CameoContentType][];
	customContentType: string;
	agreedToTerms: boolean;
	notificationNewRequests: boolean;
	notificationPendingVideos: boolean;
	notificationCancelledVideos: boolean;
	notificationCompletedRequests: boolean;
	notificationsByEmail: boolean;
	notificationsByPhone: boolean;
	customVideoEnabled: boolean;
	showReviews: boolean;
	progress: CameoSettingsProgressType;
}

export type UpdateCameoSettings = Partial<CameoSettings>;

export interface CameoPreviewUploadParams {
	uploadId: string;
}
