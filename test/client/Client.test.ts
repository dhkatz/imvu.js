import { Client, ClientUser } from '../../src';

const { IMVU_USERNAME, IMVU_PASSWORD } = process.env;

describe('Client.test.ts', () => {
  test('Client Authenticates', async (done) => {
    const client = new Client();

    await client.login(IMVU_USERNAME, IMVU_PASSWORD);

    expect(client.authenticated).toBeTruthy();

    client.logout();

    done();
  });

  test('Invalid Login Information Throws', async (done) => {
    const client = new Client();

    await expect(client.login('123', '456')).rejects.toThrow();

    done();
  });

  test('Client retrieves ClientUser', async(done) => {
    const client = new Client();

    await client.login(IMVU_USERNAME, IMVU_PASSWORD, { socket: false });

    expect(client.user).toBeInstanceOf(ClientUser);
    expect(client.user.username.toLowerCase()).toEqual(IMVU_USERNAME.toLowerCase());

    client.logout();

    done();
  });

  test('ClientUser unset when retrieving ClientUser without authentication', async(done) => {
    const client = new Client();

    expect(client.user).toBeUndefined();

    done();
  });
});
