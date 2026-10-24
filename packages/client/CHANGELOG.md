# @imvu/client

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

- ae8be48: `ChatSession` scales to many rooms. Outfit and seat changes now come from the chat broadcasts (`*putOnOutfit`, `SeatAssignment`) instead of re-reading participants on every keepalive. Keepalives start at a random offset, and `session.participant(userId)` looks up who is present. `client.account.rooms` exposes the existing `RoomManager` (recent, favorite, managed and owned rooms).
- ae8be48: Cache-first reads. Every API response's embedded documents (`denormalized`) now feed the client's cache: instances already held are updated in place, and users, products, rooms, chats and chat participants are created, so e.g. participant lists bring their users along. Controller `fetch()` and `client.resource(url, Class)` return a fresh cached instance without a request (`{ force: true }` re-reads; `{ maxAge }` and `ClientOptions.cacheMaxAge` bound staleness; IMQ-invalidated documents always re-read), and concurrent fetches of one URL share a request. New: `controller.resolve(id)` (cache only), `client.cached()`, `Resource.fetchedAt`, `ChatParticipant.user` (cached) and `fetchUser()`. `REST` gains `onResponse` and exports `normalizeDocument`.
- c4817b7: Add `client.xmlrpc`, which owns an `@imvu/xmlrpc` gateway session: it logs in lazily on first use, persists the session across runs (`./xmlrpc-session.json` by default), re-authenticates once when the server reports the session invalid, and paces calls to a minimum interval. `ClientOptions.xmlrpc` configures the gateway instance, session storage and pacing.
- ae8be48: IMs.

  - **`@imvu/client`:** `client.account.conversations` lists, fetches and sends conversations (private or group). `Conversation` covers members with IMVU's trust signal, unread count, `messages()` and `send()`, and `ConversationMessage` covers text, payloads, sender and order. `observe()` returns a `ConversationObserver` that reports each new incoming IM once, in order, without replaying history. It is triggered by conversation-list updates and `messageReceived` notices, re-checks after IMQ reconnects, and polls once a minute as a safety net.
  - **`@imvu/bot`:** IM conversations are a second message source (`BotConversation`, `bot.conversations`). The same commands answer in rooms and IMs, `sources` narrows `ctx.source` in handlers, and `bot.start()` serves IM-only bots. Set `ims: false` to opt out.

- ae8be48: `participants` on `ChatObserver`, `ChatSession` and `BotRoom` is now a live `ReadonlyMap` keyed by user id instead of an array copied on every access. Use `.get(id)`, `.size`, and ES2025 iterator helpers (`participants.values().filter(…).toArray()`). The shared TypeScript config adds the `ESNext.Iterator` lib for those helpers.
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

### Patch Changes

- 2e5d5f5: Export types that public signatures already referenced: the IMQ event maps (`IMQConnectionEvents`, `IMQQueueEvents`, `IMQMessageMountEvents`, `IMQStateMountEvents`) and, from the client, `DocumentWatchEvents`, `RealtimeMountLike`, `Utilities` and `Constructor`.
- d9f9ac7: `@imvu/imq` now uses the standard `WebSocket` (the browser's, or Node's built-in global) instead of the `ws` package, and its codec no longer uses `Buffer`. `IMQWebSocketStream` takes a standard `WebSocket`, and `decode()` accepts any `Uint8Array` (Node `Buffer`s still work).

  `@imvu/client`'s published type declarations no longer import `type-fest`, which was never declared as a dependency.

- Updated dependencies [30b9269]
- Updated dependencies [ae8be48]
- Updated dependencies [2e5d5f5]
- Updated dependencies [d9f9ac7]
- Updated dependencies [3ea9357]
- Updated dependencies [573b99f]
- Updated dependencies [ae8be48]
- Updated dependencies [ae8be48]
  - @imvu/rest@0.1.0
  - @imvu/imq@0.1.0
  - @imvu/xmlrpc@0.1.0
