# @imvu/bot

## 0.1.0

### Minor Changes

- ae8be48: IMs.

  - **`@imvu/client`:** `client.account.conversations` lists, fetches and sends conversations (private or group). `Conversation` covers members with IMVU's trust signal, unread count, `messages()` and `send()`, and `ConversationMessage` covers text, payloads, sender and order. `observe()` returns a `ConversationObserver` that reports each new incoming IM once, in order, without replaying history. It is triggered by conversation-list updates and `messageReceived` notices, re-checks after IMQ reconnects, and polls once a minute as a safety net.
  - **`@imvu/bot`:** IM conversations are a second message source (`BotConversation`, `bot.conversations`). The same commands answer in rooms and IMs, `sources` narrows `ctx.source` in handlers, and `bot.start()` serves IM-only bots. Set `ims: false` to opt out.

- ae8be48: `participants` on `ChatObserver`, `ChatSession` and `BotRoom` is now a live `ReadonlyMap` keyed by user id instead of an array copied on every access. Use `.get(id)`, `.size`, and ES2025 iterator helpers (`participants.values().filter(…).toArray()`). The shared TypeScript config adds the `ESNext.Iterator` lib for those helpers.
- ae8be48: New `@imvu/bot` package for IMVU chat bots on top of `@imvu/client`, built for one room or hundreds. Modeled on discord.js:

  - **The model:** `bot.rooms` (guilds), `room.participants` (members), and messages with a full `author` User (from the cache), the author's `participant`, and a `source` (rooms now; IM conversations next).
  - **Commands:** prefix commands with quoted arguments, aliases, `sources`, room-role permissions (everyone / moderator / owner / admin), per-user cooldowns, middleware, and a built-in `help`.
  - **Scale and recovery:** paced `joinAll()` that reports full or missing rooms; rate limits per room and across the account; and rejoining when the server drops the bot, which stops on a definite refusal and does not happen after a boot.

### Patch Changes

- Updated dependencies [30b9269]
- Updated dependencies [ae8be48]
- Updated dependencies [ae8be48]
- Updated dependencies [c4817b7]
- Updated dependencies [2e5d5f5]
- Updated dependencies [ae8be48]
- Updated dependencies [d9f9ac7]
- Updated dependencies [ae8be48]
- Updated dependencies [573b99f]
- Updated dependencies [ae8be48]
- Updated dependencies [ae8be48]
  - @imvu/client@0.1.0
