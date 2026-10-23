/**
 * @imvu/client — a read-only tour of the logged-in account: wallet, friends,
 * wishlist and inventory. Shows the two ways to read a collection: one bounded
 * page, or `for await` over every item.
 *
 *   node --env-file=.env examples/account-overview.ts
 */
import { Client } from '@imvu/client';

const username = process.env.IMVU_USERNAME;
const password = process.env.IMVU_PASSWORD ?? '';

if (!username) {
  console.error('Set IMVU_USERNAME (and IMVU_PASSWORD) — see examples/README.md');
  process.exit(1);
}

const client = new Client();
await client.login(username, password);

const { account } = client;
console.log(`${account.username} (id ${account.id})`);

// Wallet: a plain data object, not a resource.
const wallet = await account.wallet.status();
console.log(`Credits: ${wallet.credits} (+${wallet.promo_credits} promo)`);

// Counting asks for zero items, so it's cheap even for huge collections.
console.log(`Friends: ${await account.friends.count()}`);

// One bounded page of the wishlist.
const wishlist = account.wishlist.list();
const firstPage = await wishlist.page({ offset: 0, limit: 5 });
console.log(`Wishlist (${wishlist.totalCount} items), first ${firstPage.length}:`);
for (const product of firstPage) {
  console.log(`  ${product.name} by ${product.creatorName}: ${product.price} credits`);
}

// `for await` fetches pages as it goes; break early to stop fetching.
console.log('Inventory, first 10:');
let shown = 0;
for await (const product of account.inventory()) {
  console.log(`  [${product.id}] ${product.name}`);
  if (++shown === 10) break;
}
