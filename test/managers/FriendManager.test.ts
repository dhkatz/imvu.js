import {Client} from "../../src";
import {User} from "../../src";

const { IMVU_USERNAME, IMVU_PASSWORD } = process.env;

describe('FriendManager.test.ts', () => {
  const client = new Client();

  beforeAll(() => client.login(IMVU_USERNAME, IMVU_PASSWORD, { socket: false }));
  afterAll(() => client.logout());

  it('should return the proper friend count', async (done) => {
    const count = await client.user.friends.count();

    expect(count).toBe(12);

    done();
  });

  it('should return the list of friends', async (done) => {
    let count = 0;

    for await (const friend of client.user.friends.list()) {
      expect(friend).toBeInstanceOf(User);
      count++;
    }

    expect(count).toBe(12);

    done();
  });
});
