import {FriendManager, RouletteManager, WalletManager, WishlistManager} from '@/managers';
import {Avatar, ModelOptions, Product, User} from '@/models';
import {URLPaginator} from '@/util/Paginator';
import {Client} from '@/client/index';


export class ClientUser extends User {
  public friends: FriendManager;
  public roulette: RouletteManager;
  public wallet: WalletManager;
  public wishlist: WishlistManager;

  public avatar: Avatar;

  public constructor(client: Client, options?: ModelOptions) {
    super(client, options);

    this.avatar = undefined;

    this.friends = new FriendManager(client);
    this.roulette = new RouletteManager(client);
    this.wallet = new WalletManager(client);
    this.wishlist = new WishlistManager(client);
  }

  /**
   * An asynchronous generator which yields each `User` on the client's blocklist.
   */
  public async * blocklist(): AsyncIterableIterator<User> {
    this.authenticated();

    yield * new URLPaginator(this.client, this.client.users, `/user/user-${this.id}/blocked`);
  }

  public async * inventory(): AsyncIterableIterator<Product> {
    this.authenticated();

    yield * new URLPaginator(this.client, this.client.products, `/user/user-${this.id}/inventory`);
  }
}
