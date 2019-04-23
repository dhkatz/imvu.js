import { User } from '@/models';
import { Controller } from '.';

export interface UserQueryParams {
  id?: number | string | Array<number | string>;
  username?: string;
}

export const UserController = Controller<User, UserQueryParams>(User, {
  params: (params: UserQueryParams) => {
    if (Array.isArray(params.id)) {
      return { ...params, ...{ id: params.id.map((value) => `https://api.imvu.com/user/user-${value}`).join(',')} };
    }

    return params;
  },
});

export type UserController = InstanceType<typeof UserController>;
