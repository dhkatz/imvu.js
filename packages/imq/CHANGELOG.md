# @imvu/imq

## 0.1.0

### Minor Changes

- d9f9ac7: `@imvu/imq` now uses the standard `WebSocket` (the browser's, or Node's built-in global) instead of the `ws` package, and its codec no longer uses `Buffer`. `IMQWebSocketStream` takes a standard `WebSocket`, and `decode()` accepts any `Uint8Array` (Node `Buffer`s still work).

  `@imvu/client`'s published type declarations no longer import `type-fest`, which was never declared as a dependency.

### Patch Changes

- 30b9269: Add canonical resource identity, sparse URL-backed collections, explicit IMQ-backed document watches, and structured gift results. Model the authenticated account as a type-specialized canonical `CurrentUser`, with its avatar fetched lazily through the advertised relation. Normalize REST resource IDs as opaque strings and invert the client/IMQ dependency so the client composes both transport packages.

  **Breaking changes**

  - Resource IDs (including `client.rest.cid`) are now opaque `string`s, not `number`s.
  - `Paginator`/`URLPaginator` are removed; relationships and account managers return a
    sparse, async-iterable `Collection<T>` (`page()`, `count()`, `for await`).
  - `REST.resource()` returns a normalized envelope (`{ url, id, data, relations, updates }`)
    and no longer injects `_id` into the payload.
  - `gifts.gift()` returns a `GiftResult` (a discriminated `Result`) instead of `boolean`;
    prefer the new `gifts.send({ recipient, product, message, transactionId })`.
  - `client.account.wishlist.list()` returns a `Collection<Product>` instead of an async
    generator (`for await` still works). Other users' wishlists come from `user.wishlist()`.
  - `@imvu/imq` no longer depends on `@imvu/client`.

- 2e5d5f5: Export types that public signatures already referenced: the IMQ event maps (`IMQConnectionEvents`, `IMQQueueEvents`, `IMQMessageMountEvents`, `IMQStateMountEvents`) and, from the client, `DocumentWatchEvents`, `RealtimeMountLike`, `Utilities` and `Constructor`.
