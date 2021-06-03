import {Client, Product} from "../../src";

const { IMVU_USERNAME, IMVU_PASSWORD } = process.env;

describe('ClientUser.test.ts', () => {
  const client = new Client();

  beforeAll(() => client.login(IMVU_USERNAME, IMVU_PASSWORD, { socket: false }));
  afterAll(() => client.logout());

  it('should support fetching the client wishlist', async () => {
    for await (const product of client.user.inventory()) {
      expect(product).toBeInstanceOf(Product);
    }
  }, 30000);
});
