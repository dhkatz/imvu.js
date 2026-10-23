---
'@imvu/client': minor
'@imvu/rest': minor
---

Room chat. `Room` gains occupancy, type, privacy flags, `chat()` and `join()`; `Chat` is fully modeled with `participants()` (new `ChatParticipant`: join time, seat, outfit product ids), `observe()` (a `ChatObserver` that follows joins, leaves and outfit/seat changes without joining the room, resyncing after IMQ reconnects) and `join()` (a `ChatSession` that sends and receives chat and whispers, decodes legacy `*` lines such as outfits, seats and boots, keeps presence alive, leaves when booted, and can boot others). `RealtimeCoordinator` adds `listen()`, `send()` and `onReconnect()`. Every `Resource` gains `refresh()`, and `User` models `tagline`, `interests`, `online` and `availability`.

`rest.collection()` now also returns `edges` (the edge documents themselves), and client collections can opt into them with `{ items: 'edge' }`.
