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
  proof-of-work solved, which this package does not implement yet.

`gateway.call(method, params, { host })` invokes any other gateway method directly.
