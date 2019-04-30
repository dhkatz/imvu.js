import { ProductController, Product, User, Client } from '../src';

describe('ProductController.test.ts', () => {
  const client = new Client('', '');

  test('Invalid ID Returns null', async (done) => {
    const controller = new ProductController(client);

    const user = await controller.fetch({ id: 1 });

    expect(user).toBe(null);

    done();
  });

  test('Invalid Creator Returns Null', async (done) => {
    const controller = new ProductController(client);

    const user = await controller.fetch({ creator: 'x124za' })

    expect(user).toBe(null);

    done();
  });

  test('Product creator retrieves User instance', async (done) => {
    const controller = new ProductController(client);

    const [product]: Product[] = await controller.fetch({ id: 44714453 });

    const creator = await product.creator();

    expect(creator).toBeInstanceOf(User);

    done();
  });
});
