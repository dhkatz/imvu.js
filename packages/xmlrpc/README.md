# @imvu/xmlrpc

Client for IMVU's legacy XML-RPC gateway — the API the classic client still uses for
things the REST API does not expose. The headline use is resolving a product's
**current CFL** (URL with the latest revision, plus its MD5 checksum) without
guessing revision numbers.

No dependencies and no Node-only APIs (it uses `fetch`, `TextEncoder` and its own
MD5), so it runs in Node ≥ 22 and in browsers.

```ts
import { XmlRpcGateway } from '@imvu/xmlrpc';

const gateway = new XmlRpcGateway();
await gateway.login({ username: 'MyAvatar', password: '…' });

const [auth] = await gateway.authorizeProducts([51522827]);
auth.cflUrl; // 'http://userimages-akm.imvu.com/productdata/51522827/1'
auth.cflChecksum; // MD5 of the CFL bytes
auth.parentProductId;
```

The result also contains each requested product's ancestors (a derived product's CFL
imports its parent's), so asking for one product usually returns several rows — down
to a base product whose `parentProductId` is `0`. Verified live: revisions match the
CDN, and `cflChecksum` matches the MD5 of the downloaded CFL.

## Protocol notes

- Endpoints (HTTPS): `client-dynamic.imvu.com/api/xmlrpc/client.php` for most calls,
  `secure.imvu.com/api/xmlrpc/client.php` for login (`test.avatarInfoForLogin2`).
- Calls are signed with the session from login: `X-imvu-userid`, `X-imvu-csid`, and
  `X-imvu-auth = md5(userId + securityKey + requestBody)`.
- Tables (e.g. `authorizeProducts2`'s `auths` and its result) are encoded as a header
  row followed by value rows; see `flattenTable` / `unflattenTable`.
- Faults surface as `XmlRpcFault` with a `code` (see `FaultCode`). `30` means the
  session was replaced by another login; `110` means the server wants a
  proof-of-work solved before it accepts more calls (see below).

`gateway.call(method, params, { host })` invokes any other gateway method directly.

## Proof of work (fault 110)

When the server rate-limits a session it returns fault 110 (ProofOfWorkRequired).
The challenge is an **RSW time-lock puzzle** — the client must perform T
sequential modular squarings that cannot be parallelised. The nonce is a
comma-separated string: `rsw,T,N,A,Cipher`.

The standalone solver works without a gateway:

```ts
import { solveRsw } from '@imvu/xmlrpc';

const solution = solveRsw('rsw,10,3233,2021,2345'); // decimal string
```

`solveRsw` blocks until it finishes. For large T, `solveRswAsync(nonce, { signal })`
yields to the event loop every `yieldEvery` squarings (default 10 000) and can be
cancelled.

> **Unverified:** the cipher is assumed to be `Solution + A^(2^T) mod N`, either
> unreduced or reduced mod N; both are handled. This has not yet been checked
> against a nonce captured from the live server.

To retry automatically, pass a `proofOfWork` handler. The gateway calls it on
fault 110, then retries the original call (up to `maxPowRetries`, default 3).

> **Unverified sketch:** the endpoint, request body and response shape below are
> guesses, not taken from a real exchange, and the requests need the REST
> session's authentication, which this bare `fetch` does not send.

```ts
import { XmlRpcGateway, solveRswAsync } from '@imvu/xmlrpc';

const gateway = new XmlRpcGateway({
  proofOfWork: async (session, fetch) => {
    // 1. Request a challenge from the REST API
    const res = await fetch(`https://api.imvu.com/user/user-${session.userId}/pow`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ algorithm: 'rsw', difficulty: 0.001 }),
    });
    const { id, denormalized } = await res.json();
    const nonce: string = denormalized[id].data.nonce;

    // 2. Solve and submit
    await fetch(id, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ solution: await solveRswAsync(nonce) }),
    });
  },
});
```
