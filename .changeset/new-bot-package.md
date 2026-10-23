---
'@imvu/bot': minor
---

New `@imvu/bot` package for IMVU chat-room bots on top of `@imvu/client`: prefix commands with quoted arguments and aliases, room-role permissions (everyone / moderator / owner / admin), per-user cooldowns, middleware, a built-in `help`, a rate-limited outgoing queue per room, several rooms at once, and rejoining (with backoff) when the server drops the bot, but not after a boot unless asked.
