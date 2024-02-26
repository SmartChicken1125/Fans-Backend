import { IUser } from "../../../CommonAPISchemas.js";

export interface GetBlockedUsersRespBody {
	blockedUsers: IUser[];
}

export interface BlockUserRespBody {
	blockedUser: IUser;
}

export interface SearchUserRespBody {
	users: IUser[];
}
