---
'@imvu/client': minor
---

`ChatSession` scales to many rooms. Outfit and seat changes now come from the chat broadcasts (`*putOnOutfit`, `SeatAssignment`) instead of re-reading participants on every keepalive. Keepalives start at a random offset, and `session.participant(userId)` looks up who is present. `client.account.rooms` exposes the existing `RoomManager` (recent, favorite, managed and owned rooms).
