import { Controller, BaseQuery } from './BaseController';
import { User } from '../models';

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

export const UserController = Controller<User, UserQuery>(User, { transform });
export type UserController = InstanceType<typeof UserController>;
