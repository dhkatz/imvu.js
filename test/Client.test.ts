import { Client, ClientUser } from '../src';

const { USERNAME, PASSWORD } = process.env;

describe('Client.test.ts', () => {
  test('Client Authenticates', async (done) => {
    const client = new Client();

    await client.login(USERNAME, PASSWORD);

    expect(client.authenticated).toBeTruthy();

    done();
  });

  test('Invalid Login Information Throws', async (done) => {
    const client = new Client();

    expect(client.login('123', '456')).rejects.toThrow();

    done();
  });

  test('Client retrieves ClientUser', async(done) => {
    const client = new Client();

    await client.login(USERNAME, PASSWORD);

    expect(client.user).toBeInstanceOf(ClientUser);
    expect(client.user.username.toLowerCase()).toEqual(USERNAME.toLowerCase());

    done();
  });

  test('ClientUser unset when retrieving ClientUser without authentication', async(done) => {
    const client = new Client();

    expect(client.user).toBeUndefined();

    done();
  });
});
