import { ProductController, Product, User, Client } from '../../src';

describe('ProductController.test.ts', () => {
  const client = new Client();

  test('Invalid ID Returns null', async (done) => {
    const controller = new ProductController(client);

    const product = await controller.fetch(1);

    expect(product).toBe(null);

    done();
  });

  test('Invalid Creator Returns Null', async (done) => {
    const controller = new ProductController(client);

    const products = await controller.search({ creator: 'x124za' });

    expect(products).toHaveLength(0);

    done();
  });

  test('Product creator retrieves User instance', async (done) => {
    const controller = new ProductController(client);

    const product: Product = await controller.fetch(33773936);

    const creator = product.creator;

    expect(creator).toBeInstanceOf(User);
    expect(creator.registered).toBe(1313110378);

    done();
  });
});
