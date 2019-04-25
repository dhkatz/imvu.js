import { ProductController } from '../src';

describe('ProductController.test.ts', () => {
  test('Invalid ID Returns null', async (done) => {
    const controller = new ProductController();

    const user = await controller.fetch({ id: 1 });

    expect(user).toBe(null);

    done();
  });

  test('Invalid Creator Returns Null', async (done) => {
    const controller = new ProductController();

    const user = await controller.fetch({ creator: 'x124za' })

    expect(user).toBe(null);

    done();
  });
});
