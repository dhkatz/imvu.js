import {Client} from "../../src";

const { IMVU_USERNAME, IMVU_PASSWORD } = process.env;

describe('OutfitViewer.test.ts', () => {
  const client = new Client();

  beforeAll(() => client.login(IMVU_USERNAME, IMVU_PASSWORD, { socket: false }));
  afterAll(() => client.logout());

  it('should return an empty scene with an empty URL', async (done) => {
    const scene = await client.viewer.parse('');

    expect(scene.avatars).toHaveLength(0);
    expect(scene.furniture).toHaveLength(0);

    done();
  });

  // https://www.imvu.com/catalog/products_in_scene.php?avatar54313769=12182900%3B21503269%3B30467601

  it('should parse scene with only one avatar and one product', async (done) => {
    const scene = await client.viewer.parse(
      'https://www.imvu.com/catalog/products_in_scene.php?avatar54313769=12182900'
    );

    expect(scene.avatars).toHaveLength(1);
    expect(scene.furniture).toHaveLength(0);

    const avatar = scene.avatars[0];

    expect(avatar.products).toHaveLength(1);
    expect(avatar.user.id).toBe(54313769);

    done();
  });

  it('should parse scene with only one avatar and multiple products', async (done) => {
    const scene = await client.viewer.parse(
      'https://www.imvu.com/catalog/products_in_scene.php?avatar54313769=12182900%3B21503269%3B30467601'
    );

    expect(scene.avatars).toHaveLength(1);
    expect(scene.furniture).toHaveLength(0);

    const avatar = scene.avatars[0];

    expect(avatar.products).toHaveLength(3);
    expect(avatar.user.id).toBe(54313769);

    done();
  });
});
