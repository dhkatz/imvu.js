import { BaseQuery, BaseController } from './BaseController';
import { User } from '@/models';
import {Client} from "@/client";

export interface UserQuery extends BaseQuery {
  id?: string | number | number[];
  username?: string;
}

const transform = (query: UserQuery): UserQuery => {
  if (Array.isArray(query.id)) {
    return { ...query, ...{ id: query.id.map((value) => `https://api.imvu.com/user/user-${value}`).join(',')} };
  }

  return query;
};

export class UserController extends BaseController<User, UserQuery> {
  public constructor(client: Client) {
    super(client, User, { transform });
  }

  /**
   * Check if a username is available for registration
   * @param {string} username
   * @returns {Promise<boolean>}
   */
  public async available(username: string): Promise<boolean> {
    const { data } = await this.client.http.post('/validate_account', { avatarname: username });

    return data['denormalized'][data.id]['data']['valid'];
  }
}
