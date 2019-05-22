import { User } from '@/models';
import { BaseManager } from './BaseManager';

export class FollowerManager extends BaseManager {
  public async * followers(): AsyncIterableIterator<User> {

  }

  public async * following(): AsyncIterableIterator<User> {

  }

  public async follow(user: User): Promise<boolean>;
  public async follow(username: string): Promise<boolean>;
  public async follow(id: number): Promise<boolean>;
  public async follow(user: User | string | number): Promise<boolean> {
    return true;
  }

  public async unfollow(user: User): Promise<boolean>;
  public async unfollow(username: string): Promise<boolean>;
  public async unfollow(id: number): Promise<boolean>;
  public async unfollow(user: User | string | number): Promise<boolean> {
    return true;
  }
}
