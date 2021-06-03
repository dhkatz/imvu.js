import {Client} from "../../src";

const { IMVU_USERNAME, IMVU_PASSWORD } = process.env;

describe('WalletManager.test.ts', () => {
  const client = new Client();

  beforeAll(() => client.login(IMVU_USERNAME, IMVU_PASSWORD, { socket: false }));
  afterAll(() => client.logout());

  it('should return the proper amount of credits', async () => {
    const credits = await client.user.wallet.credits();

    expect(credits).toBe(0);
  });

  it('should return the correct amount of promo credits', async () => {
    const predits = await client.user.wallet.promoCredits();

    expect(predits).toBe(2808);
  });
});
