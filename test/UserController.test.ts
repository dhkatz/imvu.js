import { UserController, Client } from '../src';

describe('UserController.test.ts', () => {
  const client = new Client();

  test('Invalid ID Returns null', async (done) => {
    const controller = new UserController(client);

    const user = await controller.fetch(1);

    expect(user).toBe(null);

    done();
  });

  test('Invalid Username Returns Null', async (done) => {
    const controller = new UserController(client);

    const user = await controller.search({ username: 'x124za' })

    expect(user).toHaveLength(0);

    done();
  });
});
