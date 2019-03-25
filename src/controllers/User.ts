import { deserialize } from 'json-typescript-mapper';

import { User, UserQueryParams } from '@/models';
import BaseController from './BaseController';

export class UserAPI extends BaseController {
  constructor() {
    super('/user');
  }

  public async get(params: UserQueryParams): Promise<User | null> {
    try {
      if (params.id) {
        const response = await this.http.get(`/user-${params.id}`);

        return deserialize(User, response.data);
      } else {
        const response = await this.http.get('', { params });

        return deserialize(User, response.data);
      }
    } catch (err) {
      return null;
    }
  }
}
