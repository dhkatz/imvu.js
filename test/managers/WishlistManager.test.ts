import {Client, Product} from "../../src";

const { IMVU_USERNAME, IMVU_PASSWORD } = process.env;

describe('WishlistManager.test.ts', () => {
  const client = new Client();

  beforeAll(() => client.login(IMVU_USERNAME, IMVU_PASSWORD, { socket: false }));
  afterAll(() => client.logout());


  it('should return the current wishlist', async () => {
    for await (const product of client.user.wishlist.list()) {
      expect(product).toBeInstanceOf(Product);
    }
  });

  it('should return the expected wishlist count', async () => {
    await expect(client.user.wishlist.count()).resolves.toEqual(expect.any(Number));
  });

  it('should add product to wishlist by id', async () => {
    const count = await client.user.wishlist.count();

    await expect(client.user.wishlist.add(51522827)).resolves.toBeTruthy();

    await expect(client.user.wishlist.count()).resolves.toBe(count + 1);
  });

  it('should remove product to wishlist by id', async () => {
    const count = await client.user.wishlist.count();

    await expect(client.user.wishlist.remove(51522827)).resolves.toBeTruthy();

    await expect(client.user.wishlist.count()).resolves.toBe(count - 1);
  });
});
