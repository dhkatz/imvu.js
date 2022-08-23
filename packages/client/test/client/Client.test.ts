import { AccountManager, Client } from '../../src';

const { IMVU_USERNAME, IMVU_PASSWORD } = process.env;

if (!IMVU_USERNAME || !IMVU_PASSWORD) {
  throw new Error('IMVU_USERNAME and IMVU_PASSWORD must be set');
}

describe('Client.test.ts', () => {
  test('Client Authenticates', async () => {
    const client = new Client();

    await client.login(IMVU_USERNAME, IMVU_PASSWORD);

    expect(client.authenticated).toBeTruthy();

    client.logout();
  });

  test('Invalid Login Information Throws', async () => {
    const client = new Client();

    await expect(client.login('123', '456')).rejects.toThrow();
  });

  test('Client retrieves Account', async () => {
    const client = new Client();

    await client.login(IMVU_USERNAME, IMVU_PASSWORD, { socket: false });

    expect(client.account).toBeInstanceOf(AccountManager);
    expect(client.account.username.toLowerCase()).toEqual(IMVU_USERNAME.toLowerCase());

    client.logout();
  });

  test('Account unset when retrieving Account without authentication', async () => {
    const client = new Client();

    expect(client.account).toBeUndefined();
  });
});
