---
'@imvu/client': minor
'@imvu/bot': minor
---

IMs.

- **`@imvu/client`:** `client.account.conversations` lists, fetches and sends conversations (private or group). `Conversation` covers members with IMVU's trust signal, unread count, `messages()` and `send()`, and `ConversationMessage` covers text, payloads, sender and order. `observe()` returns a `ConversationObserver` that reports each new incoming IM once, in order, without replaying history, and catches up after IMQ reconnects.
- **`@imvu/bot`:** IM conversations are a second message source (`BotConversation`, `bot.conversations`). The same commands answer in rooms and IMs, `sources` narrows `ctx.source` in handlers, and `bot.start()` serves IM-only bots. Set `ims: false` to opt out.
