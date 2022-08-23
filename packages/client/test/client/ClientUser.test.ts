import { Client, Product } from '../../src';

const { IMVU_USERNAME, IMVU_PASSWORD } = process.env;

if (!IMVU_USERNAME || !IMVU_PASSWORD) {
  throw new Error('IMVU_USERNAME and IMVU_PASSWORD must be set');
}

describe('Account.test.ts', () => {
  const client = new Client();

  beforeAll(() => client.login(IMVU_USERNAME, IMVU_PASSWORD, { socket: false }));
  afterAll(() => client.logout());

  it('should support fetching the client wishlist', async () => {
    for await (const product of client.account.inventory()) {
      expect(product).toBeInstanceOf(Product);
    }
  }, 30000);
});
