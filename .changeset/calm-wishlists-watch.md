---
'@imvu/client': minor
'@imvu/rest': minor
'@imvu/imq': patch
---

Add canonical resource identity, sparse URL-backed collections, explicit IMQ-backed document watches, and structured gift results. Model the authenticated account as a type-specialized canonical `CurrentUser`, with its avatar fetched lazily through the advertised relation. Normalize REST resource IDs as opaque strings and invert the client/IMQ dependency so the client composes both transport packages.

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
