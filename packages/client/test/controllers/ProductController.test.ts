import { ProductController, User, Client } from '../../src';

describe('ProductController.test.ts', () => {
  const client = new Client();

  test('Invalid ID Returns null', async () => {
    const controller = new ProductController(client);

    const product = await controller.fetch(1);

    expect(product).toBe(null);
  });

  test('Invalid Creator Returns Null', async () => {
    const controller = new ProductController(client);

    const products = await controller.search({ creator: 'x124za' });

    expect(products).toHaveLength(0);
  });

  test('Product creator retrieves User instance', async () => {
    const controller = new ProductController(client);

    const product = await controller.fetch(33773936);

    const creator = await product?.creator();

    expect(creator).toBeInstanceOf(User);
    expect(creator?.registered).toBe(1313110378);
  });
});
