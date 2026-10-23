# IMs

IMs (private messages) are conversations between your account and one or more other
people. `client.account.conversations` lists, reads, sends and follows them. It needs
a logged-in client.

## Reading

```ts
for await (const conversation of client.account.conversations.list()) {
  conversation.id;
  conversation.others(client.account.id); // [{ userId, name, trust }]
  conversation.unreadMessages;
  conversation.lastMessage?.text; // embedded in the list: no extra request
}

const conversation = await client.account.conversations.fetch('143108734037');
for (const message of await conversation.messages().page({ limit: 20 })) {
  message.text; // the text payloads; empty for stickers and gifts
  message.senderId;
  message.created; // ISO 8601
  message.payloads; // [{ type: 'text', content }, …]
}
```

Messages come newest first. `message.order` increases with each message in a
conversation.

`trust` is IMVU's spam signal for each member: `'trusted'`, `'untrusted'` or
`'high_risk'`. The web app warns the recipient about the last two.

## Sending

```ts
await conversation.send('hello'); // reply in a conversation
await client.account.conversations.send(12345678, 'hi'); // start one with a user
await client.account.conversations.send([111, 222], 'hi both'); // a group conversation
```

Accounts without a verified email can only start conversations with friends; other
attempts fail with `RATE-001` ("verify email"). Sending too fast also gives
`RATE-001`.

## Following new messages

```ts
const observer = await client.account.conversations.observe();

observer.on('message', async (message, conversation) => {
  const sender = message.sender ?? (await message.fetchSender());
  console.log(`${sender.username}: ${message.text}`);
  if (message.text === '!ping') await conversation.send('pong');
});

observer.close();
```

The observer reports each new incoming message once, in order within its
conversation.

- **No history.** It never replays old messages. For a conversation it didn't know
  about, only messages sent after it started count.
- **Your own lines are skipped**, unless you pass `{ includeOwn: true }`.
- **Missed messages are caught up.** After an IMQ reconnect it re-checks recent
  conversations, so messages sent while it was offline are still reported.

How it works: IMVU announces every IM as a change to your conversation list (on IMQ
queue `inv:/profile/<id>`, mount `edge:conversations`). The observer then reads that
conversation's latest messages. Conversations don't embed full user documents, so
`message.sender` may be empty the first time someone writes; `fetchSender()` reads
them once and caches them.

For bots, [`@imvu/bot`](/packages/bot/) answers IMs with the same commands it runs in
rooms; see [Build a bot](/recipes/bots).
