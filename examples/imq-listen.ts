/**
 * @imvu/rest + @imvu/imq — authenticate with the REST API, then open a live IMQ
 * connection using the details from /login/me.
 *
 *   node --env-file=.env examples/imq-listen.ts [queueName]
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
const imqUrl = login.relations?.imq;

if (!imqUrl) {
  console.error('This session does not expose an IMQ endpoint');
  process.exit(1);
}

const manager = new IMQManager({
  url: imqUrl,
  userId: String(rest.cid),
  sessionId: login.data.session_id,
  metadata: { app: 'imvu_next', platform_type: 'big' },
});

// Lifecycle is observable — no polling needed.
manager.on('status', (status) => console.log(`IMQ status: ${status}`));
manager.on('error', (error) => console.error('IMQ error:', error.message));

// 3. Connect — resolves once authenticated (reject after 15s rather than hang forever).
await manager.connect({ timeout: 15_000 });

// 4. Optionally subscribe to a queue and log everything it emits. Queue-level
//    subscription discovers mounts as they appear — no need to know their names.
const queueName = process.argv[2];
if (queueName) {
  const queue = manager.subscribe(queueName);
  queue.on('mount', (mount) => console.log('mount:', mount));
  queue.on('message', (message) => console.log('message:', message));
  queue.on('state', (state) => console.log('state:', state));
  queue.on('subscriber', (event) => console.log('subscriber:', event));
  console.log(`Subscribed to ${queueName}. Waiting for events…`);
} else {
  console.log('Tip: pass a queue name to subscribe, e.g. `… imq-listen.ts <queue>`.');
}

console.log('Press Ctrl+C to exit.');
process.on('SIGINT', () => {
  manager.close();
  process.exit(0);
});
