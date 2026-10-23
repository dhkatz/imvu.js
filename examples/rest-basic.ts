/**
 * @imvu/rest — the low-level client: cookie-based auth + raw typed JSON,
 * no resource classes. See examples/README.md for how to run.
 */
import { REST } from '@imvu/rest';

const username = process.env.IMVU_USERNAME;
const password = process.env.IMVU_PASSWORD ?? '';

if (!username) {
  console.error('Set IMVU_USERNAME (and IMVU_PASSWORD) — see examples/README.md');
  process.exit(1);
}

const rest = new REST();
await rest.login(username, password);
console.log(`Authenticated as ${username} — cid ${rest.cid}`);

// Raw denormalized API envelope; pick out the node we asked for.
const me = await rest.request('/login/me');
const login = me.denormalized[me.id];

console.log('session source:', login.data.source);
console.log('IMQ endpoint:', login.relations?.imq);
