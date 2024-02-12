import { IProfile, IStory } from "../../CommonAPISchemas.js";

export type CreateStoryUrl = {
	url: string;
	pointX: number;
	pointY: number;
};

export type CreateStoryTag = {
	creatorId: string;
	color: string;
	pointX: number;
	pointY: number;
};

export interface StoryCreateReqBody {
	mediaId: string;
	storyUrls: CreateStoryUrl[];
	storyTags: CreateStoryTag[];
}

export type StoryRespBody = IStory;

export interface StoriesRespBody {
	stories: StoryRespBody[];
	page: number;
	size: number;
	total: number;
}

export type StoryFeedRespBody = {
	creators: (IProfile & {
		stories: IStory[];
	})[];
	page: number;
	size: number;
	total: number;
};
