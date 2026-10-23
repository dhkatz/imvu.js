---
'@imvu/client': minor
'@imvu/rest': minor
---

Cache-first reads. Every API response's embedded documents (`denormalized`) now feed the client's cache: instances already held are updated in place, and users, products, rooms, chats and chat participants are created, so e.g. participant lists bring their users along. Controller `fetch()` and `client.resource(url, Class)` return a fresh cached instance without a request (`{ force: true }` re-reads; `{ maxAge }` and `ClientOptions.cacheMaxAge` bound staleness; IMQ-invalidated documents always re-read), and concurrent fetches of one URL share a request. New: `controller.resolve(id)` (cache only), `client.cached()`, `Resource.fetchedAt`, `ChatParticipant.user` (cached) and `fetchUser()`. `REST` gains `onResponse` and exports `normalizeDocument`.
