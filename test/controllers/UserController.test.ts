import { UserController, Client } from '../../src';
import {User} from "../../src";

describe('UserController.test.ts', () => {
  const client = new Client();

  it('return null on an invalid ID', async (done) => {
    const controller = new UserController(client);

    const user = await controller.fetch(1);

    expect(user).toBe(null);

    done();
  });

  it('should return null on invalid username', async (done) => {
    const controller = new UserController(client);

    const user = await controller.search({ username: 'x124za' });

    expect(user).toHaveLength(0);

    done();
  });

  it('should return a user on ID lookup', async (done) => {
    const controller = new UserController(client);

    const user = await controller.fetch(54313769);

    expect(user).toBeInstanceOf(User);
    expect(user.username).toBe('ulIr');

    done();
  });
});
