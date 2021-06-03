import {Client} from "../../src";

const { IMVU_USERNAME, IMVU_PASSWORD } = process.env;

describe('RouletteManager.test.ts', () => {
  const client = new Client();

  beforeAll(() => client.login(IMVU_USERNAME, IMVU_PASSWORD, { socket: false }));
  afterAll(() => client.logout());

  it('should fetch the current roulette status', async () => {
    const roulette = client.user.roulette.status();

    await expect(roulette).resolves.toHaveProperty('next');
  });

  it('should spin the wheel if available', async () => {
    const roulette = await client.user.roulette.status();

    if (roulette.available) {
      await expect(client.user.roulette.spin()).resolves.toHaveProperty('available');
    } else {
      await expect(client.user.roulette.spin()).toThrow();
    }
  });
});
