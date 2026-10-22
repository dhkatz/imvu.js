---
'@imvu/imq': minor
'@imvu/client': patch
---

`@imvu/imq` now uses the standard `WebSocket` (the browser's, or Node's built-in global) instead of the `ws` package, and its codec no longer uses `Buffer`. `IMQWebSocketStream` takes a standard `WebSocket`, and `decode()` accepts any `Uint8Array` (Node `Buffer`s still work).

`@imvu/client`'s published type declarations no longer import `type-fest`, which was never declared as a dependency.
