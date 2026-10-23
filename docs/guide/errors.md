# Handling errors

## Which calls throw, and which don't

Most calls throw when something goes wrong. A few return a value instead, because
failure is a normal outcome for them:

| Call                                                         | On failure                                  |
| ------------------------------------------------------------ | ------------------------------------------- |
| Lookups, `request()`, `resource()`, collection reads         | Throw                                       |
| `account.gifts.send()`                                       | Returns `{ ok: false, error }`              |
| `account.friends.add()` / `.remove()`                        | Returns `false`                             |
| `account.wishlist.add()` / `.remove()`                       | Returns `false`                             |
| `account.followers.follow()` / `.unfollow()`                 | Returns `false` when the API refuses; other errors throw |
| `relation()` methods such as `user.profile()`, `product.parent()` | Return `null` when the relation doesn't exist |

## API errors: `IMVUAPIError`

When IMVU answers with a failure, `@imvu/rest` throws `IMVUAPIError`. Its `apiCode` is
IMVU's machine-readable error code, and `message` is the human-readable text:

```ts
import { IMVUAPIError } from '@imvu/rest';

try {
  await client.request(`/user/user-${client.account.id}/friends/user-${id}`, { method: 'DELETE' });
} catch (error) {
  if (error instanceof IMVUAPIError) {
    console.error(`IMVU refused (${error.apiCode}): ${error.message}`);
    console.error(error.response); // the full failure envelope
  } else {
    throw error; // network failure, a non-JSON response, …
  }
}
```

Other errors you may see from the REST layer:

- **A network error** from `fetch` itself (DNS, TLS, offline). Pass a `signal` in the
  request options to add timeouts or cancellation.
- **`Expected a JSON response …`**: IMVU answered with something other than JSON, usually
  an HTML error page during an outage or when blocked.
- **`You must be logged into to access account information!`**: you read
  `client.account` before `login()` finished.

## Gift results

Sending a gift spends credits, so it never throws for an expected failure. It
distinguishes **rejected** (IMVU said no; nothing happened) from **indeterminate** (the
request may or may not have gone through):

```ts
const result = await client.account.gifts.send({ recipient, product });

if (!result.ok) {
  const { error } = result;
  if (error.kind === 'rejected') {
    // error.reason: 'insufficient_credits' | 'already_owned' | 'not_giftable'
    //               | 'recipient_restricted' | 'unknown'
  } else {
    // 'indeterminate': check before retrying, or you may gift twice.
  }
}
```

See [Gifting](/recipes/gifting) for a complete flow.

## Other packages

| Package        | Error                        | When                                                                   |
| -------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `@imvu/client` | `CollectionNotWatchableError` | `watch()` on a collection that publishes no updates.                  |
| `@imvu/client` | `RangeError`                 | `page()` with a negative offset or a non-positive limit.               |
| `@imvu/xmlrpc` | `XmlRpcFault`                | The gateway returned a fault. Compare `code` with `FaultCode`.         |
| `@imvu/xmlrpc` | `XmlRpcHttpError`            | The gateway answered with a non-200 HTTP status.                       |
| `@imvu/chkn`   | `ChknError`                  | A malformed CFL/CHKN archive, LZMA stream or product template.         |
| `@imvu/cal3d`  | `Cal3DError`                 | The bytes aren't a Cal3D file, or are corrupt.                         |

Common XML-RPC fault codes:

```ts
import { FaultCode, XmlRpcFault } from '@imvu/xmlrpc';

if (error instanceof XmlRpcFault) {
  switch (error.code) {
    case FaultCode.InvalidLoginOrPassword: // 11
    case FaultCode.TwoFactorRequired: // 107
    case FaultCode.InvalidAuthData: // 30: session replaced by another login
    case FaultCode.ProofOfWorkRequired: // 110: rate-limited; see @imvu/xmlrpc
  }
}
```

`client.xmlrpc` already recovers from `InvalidAuthData` by logging in once more, so
you'll only see it when using `XmlRpcGateway` directly.
