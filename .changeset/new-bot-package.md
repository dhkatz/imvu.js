---
'@imvu/bot': minor
---

New `@imvu/bot` package for IMVU chat bots on top of `@imvu/client`, built for one room or hundreds. Modeled on discord.js:

- **The model:** `bot.rooms` (guilds), `room.participants` (members), and messages with a full `author` User (from the cache), the author's `participant`, and a `source` (rooms now; IM conversations next).
- **Commands:** prefix commands with quoted arguments, aliases, `sources`, room-role permissions (everyone / moderator / owner / admin), per-user cooldowns, middleware, and a built-in `help`.
- **Scale and recovery:** paced `joinAll()` that reports full or missing rooms; rate limits per room and across the account; and rejoining when the server drops the bot, which stops on a definite refusal and does not happen after a boot.
