---
'@imvu/client': minor
'@imvu/bot': minor
---

`participants` on `ChatObserver`, `ChatSession` and `BotRoom` is now a live `ReadonlyMap` keyed by user id instead of an array copied on every access. Use `.get(id)`, `.size`, and ES2025 iterator helpers (`participants.values().filter(…).toArray()`). The shared TypeScript config adds the `ESNext.Iterator` lib for those helpers.
