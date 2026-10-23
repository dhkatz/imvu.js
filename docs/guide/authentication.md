# Authentication and sessions

## Logging in

```ts
import { Client } from '@imvu/client';

const client = new Client();
await client.login(process.env.IMVU_USERNAME!, process.env.IMVU_PASSWORD!);
```

Keep credentials out of source code. The examples read them from a `.env` file
(`node --env-file=.env …`).

### Two-factor authentication

If the account has 2FA enabled, pass the current code:

```ts
await client.login(username, password, { twoFactorCode: '123456' });
```

## Sessions are saved and reused

Logging in sets session cookies. In Node they're saved to `./cookies.json`, and the next
`login()` with the **same username** reuses them instead of logging in again. If the saved
session has expired, `login()` notices, logs in afresh, and saves the new session.

::: warning IMVU rate-limits logins
Logging in over and over (in a loop, per request, or on every test) can lock you
out for a while. Create one client, log in once, and keep using it. The saved
session means restarting your program doesn't count as a new login.
:::

::: danger Keep `cookies.json` private
The cookie file is a live session for your account. Add it (and `xmlrpc-session.json`,
below) to `.gitignore`.
:::

### Choosing where the session lives

Pass your own `REST` to the client to configure it:

```ts
import { Client } from '@imvu/client';
import { REST } from '@imvu/rest';

// A different file
const client = new Client(new REST({ cookiePath: './.sessions/alice.json' }));

// Memory only: nothing written to disk, so every run logs in again
const ephemeral = new Client(new REST({ cookieStorage: null }));
```

For anything other than a file (a database, a secrets manager, a key-value store),
implement `CookieStorage`. It has two methods: `load()` returns the saved JSON, or `null`
if nothing is saved, and `save(json)` stores it.

```ts
import type { CookieStorage } from '@imvu/rest';

function kvStorage(kv: KeyValueStore, key: string): CookieStorage {
  return {
    load: async () => (await kv.get(key)) ?? null,
    save: async (json) => kv.set(key, json),
  };
}

const client = new Client(new REST({ cookieStorage: kvStorage(kv, 'imvu:alice') }));
```

A failed `save()` never fails a request. The only cost is that the next run has to log in again.

### Several accounts at once

Give each client its own session storage, for both REST and XML-RPC:

```ts
import { fileCookieStorage, REST } from '@imvu/rest';

function clientFor(name: string) {
  return new Client(new REST({ cookiePath: `./.sessions/${name}.json` }), {
    xmlrpc: { sessionStorage: fileCookieStorage(`./.sessions/${name}.xmlrpc.json`) },
  });
}

const alice = clientFor('alice');
const bob = clientFor('bob');
await alice.login('Alice', alicePassword);
await bob.login('Bob', bobPassword);
```

## The XML-RPC session

A few things, such as [resolving a product's current files](/recipes/download-products),
only exist on IMVU's legacy XML-RPC gateway, which has its own session. `client.xmlrpc`
handles it for you:

- **Lazily.** Nothing happens at `login()`. The gateway logs in the first time you
  call it, so REST-only programs never perform a second login.
- **Saved.** Its session goes to `./xmlrpc-session.json` and is reused across runs.
  Pass `xmlrpc: { sessionStorage }` to `Client` to change that, or `null` to keep it in
  memory.
- **Self-healing.** If the gateway reports the session invalid (for example, because
  the same account logged in elsewhere), the client logs in once more and retries.
- **Paced.** Calls run one at a time, at least 250 ms apart (`xmlrpc: { minimumInterval }`).

## Logging out

```ts
await client.logout();
```

This closes any realtime connection and forgets the session **in this client**. It
does not delete the saved cookie file, so the next `login()` with the same username can
still reuse that session. To really end it, delete the file (or clear your `CookieStorage`).

## Using `@imvu/rest` directly

The same login and session handling is available without the modeled client:

<<< ../../examples/rest-basic.ts

After `login()`, `rest.cid` is the account's id, and every non-GET request
automatically carries the auth headers IMVU requires for writes.
