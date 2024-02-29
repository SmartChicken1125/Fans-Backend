import { PostType } from "@prisma/client";
import {
	ICategory,
	IFan,
	IFundraiser,
	IGiveaway,
	IPaidPost,
	IPoll,
	IPost,
	IProfile,
	IReply,
	IRole,
	ISchedule,
	ITaggedPeople,
	IUpload,
	IUser,
} from "../../CommonAPISchemas.js";

export interface PostAdvanced {
	isHideLikeViewCount: boolean;
	isTurnOffComment: boolean;
	isPaidLabelDisclaimer: boolean;
}

export interface PostLocation {
	city: string;
	country: string;
	district: string;
	isoCountryCode: string;
	name: string;
	postalCode: string;
	region: string;
	street: string;
	subregion: string;
	timezone: string;
}

export interface PaidPost {
	price: number;
	currency: string;
	thumbIds?: string[];
	tiers?: string[];
	roles?: string[];
	users?: string[];
}

export interface FundraiserBody {
	title: string;
	caption?: string;
	thumbId?: string;
	price: number;
	currency: string;
	endDate: string;
	isXpAdd: boolean;
}

export interface GiveawayBody {
	prize: string;
	thumbId?: string;
	endDate: string;
	winnerCount: number;
	roles?: string[];
}

export interface PollBody {
	question: string;
	caption?: string;
	answers: string[];
	thumbId?: string;
	endDate: string;
	isPublic: boolean;
	roles?: string[];
}

export interface ScheduleBody {
	startDate: string;
	endDate?: string;
}

export interface TaggedPeople {
	userId: string;
	pointX: number;
	pointY: number;
}

export interface PostMediaTags {
	userId: string;
	pointX: number;
	pointY: number;
}

export interface PostMedia {
	postMediaId: string;
	tags: PostMediaTags[];
}

export interface PostCreateReqBody {
	title?: string;
	type: PostType;
	caption: string;
	thumbId?: string;
	// video, image, audios can be string
	// fundraiser will be FundrasierResource
	// poll will be PollResource
	postMedias?: PostMedia[];
	text?: string;
	taggedPeoples?: TaggedPeople[];
	advanced?: PostAdvanced;
	location?: string;

	roles?: string[];
	tiers?: string[];
	users?: string[];
	categories?: string[];
	episodeNumber?: number;
	description?: string;
	formIds?: string[];
	isPrivate?: boolean;
	isNoiseReduction?: boolean;
	isAudioLeveling?: boolean;
	paidPost?: PaidPost;
	fundraiser?: FundraiserBody;
	giveaway?: GiveawayBody;
	poll?: PollBody;
	schedule?: ScheduleBody;
}

export interface PostUpdateReqBody {
	title?: string;
	type?: PostType;
	caption?: string;
	thumbId?: string;
	// video, image, audios can be string
	// fundraiser will be FundrasierResource
	// poll will be PollResource
	postMedias?: PostMedia[];
	text?: string;
	taggedPeoples?: TaggedPeople[];
	advanced?: PostAdvanced;
	location?: string;

	roles?: string[];
	tiers?: string[];
	users?: string[];
	categories?: string[];
	episodeNumber?: number;
	description?: string;
	formIds?: string[];
	isPrivate?: boolean;
	isNoiseReduction?: boolean;
	isAudioLeveling?: boolean;
	paidPost?: PaidPost;
	fundraiser?: FundraiserBody;
	giveaway?: GiveawayBody;
	poll?: PollBody;
	schedule?: ScheduleBody;
}

export interface PostFilterQuery {
	query?: string;
	type?: PostType;
	page?: number;
	size?: number;
	schedule?: boolean;
}

export const sortType = {
	Latest: "Latest",
	Popular: "Popular",
} as const;

export type SortType = (typeof sortType)[keyof typeof sortType];

export interface PostFeedQuery {
	sort?: SortType;
	page?: number;
	size?: number;
	categoryId?: string;
	userListId?: string;
	schedule?: boolean;
}

export interface PostArchiveReqBody {
	id: string;
}

export interface PostsRespBody {
	posts: PostRespBody[];
	page: number;
	size: number;
	total: number;
	hasAccess: boolean;
}

export type PostRespBody = IPost & {
	profile?: IProfile;
	roles?: IRole[];
	users?: IUser[];
	categories?: ICategory[];
	giveaway?: IGiveaway & { roles: IRole[] };
	replies?: IReply[];
	fundraiser?: IFundraiser;
	paidPost?: IPaidPost;
	poll?: IPoll & { roles: IRole[] };
	schedule?: ISchedule;
	taggedPeoples?: (ITaggedPeople & { user: IUser })[];
};

export interface PostHideRespBody {
	hiddenPostIds: string[];
}

export interface BlockedCreatorsRespBody {
	blockedCreatorIds: string[];
}

export interface UploadFormRespBody {
	forms: IUpload[];
}

export interface SaveFormReqBody {
	formIds: string[];
}

export interface SendInvitationReqBody {
	emails: string[];
	message: string;
}

export interface AnalyzeFansRespBody {
	total: number;
	data: { from: number; to: number; fans: number }[];
}

export interface SearchFansRespBody {
	fans: IFan[];
	page: number;
	size: number;
	total: number;
}

export interface LikePostResp {
	likePostIds: string[];
}
