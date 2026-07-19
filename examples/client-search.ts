/**
 * @imvu/client — the high-level modeled API (resource classes + managers)
 * layered on top of @imvu/rest.
 *
 *   node --env-file=.env examples/client-search.ts [username]
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
console.log(`Logged in as ${client.account.username}`);

const target = process.argv[2] ?? 'IMVU';
const [user] = await client.users.search({ username: target });

if (!user) {
  console.error(`No user found for "${target}"`);
  process.exit(1);
}

console.log(`Found ${user.username} (id ${user.id})`);
