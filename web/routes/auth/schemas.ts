// This file is supposed to be synced between frontend and backend
// frontend: helper/endpoints/auth/schemas.ts
// backend: web/routes/auth/schemas.ts

import {
	IFanReferral,
	IOAuth2LinkedAccount,
	IProfile,
	IStoryViewer,
	IUser,
} from "../../CommonAPISchemas.js";

export interface AuthPasswordRegisterReqBody {
	email: string;
	username: string;
	password: string;
}

export interface TokenRespBody {
	token: string;
}

export interface AuthPasswordLoginReqBody {
	email: string;
	password: string;
}

export interface AuthForgotPasswordReqBody {
	email: string;
}

export interface AuthVerifyCodeReqBody {
	code: string;
}

export interface AuthResendReqBody {
	/**
	 * Optional. If provided, will resend the code to the specified email address and upon verification, will update the email address of the user.
	 */
	email?: string;
}

export interface AuthResetPasswordReqBody {
	code: string;
	password: string;
}

export interface AuthCheckResetPasswordReqBody {
	code: string;
}

export type AuthUserInfoRespBody = IUser & {
	profile?: IProfile;
	viewedStoryCreators?: IStoryViewer[];
	gems: number;
	gemsAmount: number;
	payoutBalance: number;
	linkedAccounts?: IOAuth2LinkedAccount[];
	fanReferrals?: IFanReferral[];
};

export interface AuthOAuth2AuthorizeReqParams {
	provider: string;
}

export interface AuthOAuth2AuthorizeReqBody {
	code: string;
	redirectUri: string;
	codeVerifier?: string;
}

export interface AuthOAuth2LinkReqParams {
	provider: string;
}

export interface AuthOAuth2LinkReqBody {
	code: string;
	redirectUri: string;
	codeVerifier?: string;
}

export interface AuthOAuth2LinkRespBody {
	linkedAccount: IOAuth2LinkedAccount;
}

export interface AuthOAuth2LinkListRespBody {
	links: {
		[provider: string]: {
			id: string;
			accountId: string;
			email: string;
			name: string;
			avatarUrl?: string;
			linkedAt: string;
		};
	};
}

export interface SessionIdParams {
	sessionId: string;
}
