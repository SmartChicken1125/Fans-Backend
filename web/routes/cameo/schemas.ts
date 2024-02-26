import { CameoContentType } from "@prisma/client";
import { IMediaVideoUpload } from "../../CommonAPISchemas.js";

export interface CameoProfileDuration {
	length: number;
	price: number;
	currency: string;
}

export interface CameoProfile {
	description: string;
	sexualContentEnabled: boolean;
	contentTypes: (typeof CameoContentType)[keyof typeof CameoContentType][];
	customContentType: string;
	customVideoDurations: CameoProfileDuration[];
	fulfillmentTime: number | null; // hours
	previews: IMediaVideoUpload[];
}
