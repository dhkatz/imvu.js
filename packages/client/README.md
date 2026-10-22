# @imvu/client

The client library for interacting with the IMVU API. (log in, gifting, messaging, etc.)

## Wishlists, gifting, and updates

Wishlists are sparse, paginated collections. Iterating fetches bounded pages as
needed, rather than loading a potentially huge wishlist into memory:

```ts
import { Client } from '@imvu/client';

const client = new Client();
await client.login(username, password);

const [person] = await client.users.search({ username: 'Bob' });
if (!person) throw new Error('User not found');

const wishlist = person.wishlist();
const firstPage = await wishlist.page({ offset: 0, limit: 25 });
const product = firstPage[0];

if (product) {
  const result = await client.account.gifts.send({ recipient: person, product });
  if (!result.ok) console.error(result.error);
}

const watch = await wishlist.watch();
watch.on('invalidate', ({ document }) => {
  // Membership may have changed. Iterate again or request the range the
  // application currently needs.
  console.log(document.url, document.revision);
});

// Later:
watch.close();
```

Fetching the same canonical URL through a controller, relationship, or collection
returns the same resource object while it remains in use. Re-fetching hydrates that
object in place. Realtime subscriptions are always explicit; ordinary fetches do not
open IMQ connections. Calling `watch()` on a collection whose response advertises
`updates: null` throws `CollectionNotWatchableError`.

## Legacy XML-RPC gateway

`client.xmlrpc` exposes IMVU's XML-RPC gateway (see `@imvu/xmlrpc`) — for example to
resolve a product's current CFL, which the REST API does not provide:

```ts
await client.login('username', 'password');

const [auth] = await client.xmlrpc.authorizeProducts([51522827]);
auth.cflUrl; // latest revision's CFL
auth.cflChecksum; // MD5 of the CFL bytes
```

The gateway logs in lazily on first use, so REST-only usage never performs a second
login. Its session is saved to `./xmlrpc-session.json` (configurable through
`new Client(rest, { xmlrpc: { sessionStorage } })`; `null` disables it) and reused
across runs for the same user. If the server reports the session invalid, the client
logs in once more and retries. Calls run one at a time, at least `minimumInterval` ms
apart (default 250). Pass `xmlrpc: { gateway }` to supply a pre-configured gateway.
