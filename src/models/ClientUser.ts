import { FriendManager, RouletteManager, WalletManager } from '@/managers';
import { Avatar, User, ModelOptions } from '@/models';
import { URLPaginator, Paginators } from '@/util/Paginator';
import { Client } from '@/client';


export class ClientUser extends Avatar {
  public friends: FriendManager;
  public roulette: RouletteManager;
  public wallet: WalletManager;

  public constructor(client: Client, options?: ModelOptions) {
    super(client, options);

    this.friends = new FriendManager(this.client);
    this.roulette = new RouletteManager(this.client);
    this.wallet = new WalletManager(this.client);
  }

  /**
   * An asynchronous generator which yields each `User` on the client's blocklist.
   */
  public async * blocklist(): AsyncIterableIterator<User> {
    if (!this.client.authenticated) {
      throw new Error('Cannot retrieve data without user authentication!');
    }

    yield * new URLPaginator(this.client, Paginators.User, `/user/user-${this.id}/blocked`);
  }
}
