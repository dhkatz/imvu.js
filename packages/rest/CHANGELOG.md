# @imvu/rest

## 0.1.0

### Minor Changes

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

- ae8be48: Cache-first reads. Every API response's embedded documents (`denormalized`) now feed the client's cache: instances already held are updated in place, and users, products, rooms, chats and chat participants are created, so e.g. participant lists bring their users along. Controller `fetch()` and `client.resource(url, Class)` return a fresh cached instance without a request (`{ force: true }` re-reads; `{ maxAge }` and `ClientOptions.cacheMaxAge` bound staleness; IMQ-invalidated documents always re-read), and concurrent fetches of one URL share a request. New: `controller.resolve(id)` (cache only), `client.cached()`, `Resource.fetchedAt`, `ChatParticipant.user` (cached) and `fetchUser()`. `REST` gains `onResponse` and exports `normalizeDocument`.
- 573b99f: `@imvu/rest` now runs on the standard `fetch` instead of axios, and drops `axios`, `axios-cookiejar-support` and `tough-cookie-file-store` (`tough-cookie` remains). Existing `cookies.json` session files are migrated automatically.

  **Breaking changes**

  - `REST.http` (the axios instance) and `Client.http` are removed. Use `rest.request()` / `client.request()` for API calls, or `rest.fetch()` for a raw `Response`.
  - Request options are now `RequestOptions` (`method`, `params`, `data`, `headers`, `signal`, `baseURL`) rather than `AxiosRequestConfig`.
  - `REST.cookies` is now an async method, `cookies(): Promise<CookieJar>`.
  - `RESTOptions` gains `cookieStorage` (pluggable persistence; `null` for memory-only) and `fetch` (a custom `fetch` implementation).
  - Non-JSON responses now throw instead of being returned as-is. `follow`/`unfollow`, `friends.add`/`remove` and `roulette.spin` now see API rejections: the boolean methods return `false`, and `spin` throws `IMVUAPIError`. Previously these failures were silently ignored.

- ae8be48: Proof of work. `RESTOptions.proofOfWork` (a nonce → solution solver) lets `rest.request()` handle `VERIFY-001`: it solves the session's outstanding `/pow` challenges with `rest.solveChallenges()` — the web client's flow — and retries (up to `maxPowRetries`, default 3). `@imvu/client` supplies the RSW solver from `@imvu/xmlrpc` by default and routes XML-RPC fault 110 to the same challenges.
- ae8be48: Room chat. `Room` gains occupancy, type, privacy flags, `chat()` and `join()`; `Chat` is fully modeled with `participants()` (new `ChatParticipant`: join time, seat, outfit product ids), `observe()` (a `ChatObserver` that follows joins, leaves and outfit/seat changes without joining the room, resyncing after IMQ reconnects) and `join()` (a `ChatSession` that sends and receives chat and whispers, decodes legacy `*` lines such as outfits, seats and boots, keeps presence alive, leaves when booted, and can boot others). `RealtimeCoordinator` adds `listen()`, `send()` and `onReconnect()`. Every `Resource` gains `refresh()`, and `User` models `tagline`, `interests`, `online` and `availability`.

  `rest.collection()` now also returns `edges` (the edge documents themselves), and client collections can opt into them with `{ items: 'edge' }`.
