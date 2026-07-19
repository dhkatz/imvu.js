/**
 * @imvu/rest + @imvu/imq — authenticate with the REST API, then open a live IMQ
 * connection using the details from /login/me.
 *
 *   node --env-file=.env examples/imq-listen.ts [queueName] [mountName]
 *
 * Pass a queue name to subscribe and log its events; with no arguments it just
 * connects and idles. See examples/README.md.
 */
import { IMQManager } from '@imvu/imq';
import { REST } from '@imvu/rest';

const username = process.env.IMVU_USERNAME;
const password = process.env.IMVU_PASSWORD ?? '';

if (!username) {
  console.error('Set IMVU_USERNAME (and IMVU_PASSWORD) — see examples/README.md');
  process.exit(1);
}

// 1. Authenticate (reuses a cached session when the username matches cookies.json).
const rest = new REST();
await rest.login(username, password);
console.log(`Logged in as ${username} (cid ${rest.cid})`);

// 2. The IMQ url + session token live on /login/me.
const me = await rest.request('/login/me');
const login = me.denormalized[me.id];

const manager = new IMQManager({
  url: login.relations.imq,
  userId: String(rest.cid),
  sessionId: login.data.session_id,
  metadata: { app: 'imvu_next', platform_type: 'big' },
});

// 3. Connect — resolves once authenticated with the gateway.
await manager.connect();
console.log(`IMQ ${manager.state.status} at ${login.relations.imq}`);

// 4. Optionally subscribe to a queue and log everything it emits.
const [queueName, mountName = 'message'] = process.argv.slice(2);
if (queueName) {
  const mount = manager.subscribeMessage(queueName, mountName);
  mount.on('message', (message) => console.log('message:', message));
  mount.on('subscriber', (event) => console.log('subscriber:', event));
  console.log(`Subscribed to ${queueName}/${mountName}. Waiting for events…`);
} else {
  console.log('Tip: pass a queue name to subscribe, e.g. `… imq-listen.ts <queue> [mount]`.');
}

console.log('Press Ctrl+C to exit.');
process.on('SIGINT', () => {
  manager.close();
  process.exit(0);
});
