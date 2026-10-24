# Rooms and chat

`@imvu/client` can watch a room from outside or join it as your account. Both need a
logged-in client. This page covers classic chat rooms; live (audience) rooms are not
supported yet, and `room.chat()` returns `null` for them.

## Rooms and their chat

A `Room` is the place: name, owner, privacy, occupancy. Its conversation lives in a
separate `Chat` resource, and the people in it are that chat's participants:

```ts
const room = await client.rooms.fetch('123456-1'); // the end of a room URL
room.name;
room.occupancy; // as listed; can lag behind reality
room.privacy; // 'public' | 'private'

const chat = await room.chat(); // null for live rooms
```

`client.account.rooms` lists rooms tied to your account: `recent()`, `favorites()`,
`owned()` and `managed()`.

## Who is in a room (without joining)

Any logged-in account can read a room's participants without entering it, and
**nobody in the room can see you doing so**:

```ts
for await (const participant of chat.participants()) {
  participant.userId;
  participant.created; // when they joined (ISO 8601)
  participant.productIds; // their outfit, avatar body first
  participant.seatNumber;
  participant.user?.username; // the full User comes embedded in the list
}
```

To follow changes, observe the chat. The observer reads the list once, then keeps it
current from IMQ, re-reading everything after a reconnect so nothing is missed:

```ts
const observer = await chat.observe();

observer.participants; // live ReadonlyMap: user id → ChatParticipant
observer.on('join', (participant) => console.log(participant.user?.username, 'joined'));
observer.on('leave', ({ userId, participant }) => console.log(userId, 'left'));
observer.on('update', (participant, changes) => console.log(participant.userId, changes)); // ['outfit', 'seat']

observer.close();
```

`participants` is a live map, not a copy, so reading it is free; ES2025 iterator
helpers work on it directly (`observer.participants.values().filter(…).toArray()`).

Every participant's keepalive also arrives as an update. With `trackChanges` on (the
default) the observer re-reads the participant to detect outfit and seat changes.
Pass `{ trackChanges: false }` to watch only joins and leaves, which is much lighter
when observing many rooms.

## Joining a room

Joining makes your account visible in the room, and **everyone there sees what you
say**.

```ts
const session = await room.join(); // or chat.join()

session.on('message', (message) => {
  message.userId; // the sender
  message.text;
  message.action; // `/me …`
  message.whisper; // whispered rather than said
  message.toMe; // whispered to you
});

await session.send('hello');
await session.whisper(userId, 'psst');
await session.leave();
```

A session:

- **keeps you in the room.** The server drops a participant after about four minutes
  without a keepalive. The session sends one every 45 seconds (`keepAliveInterval`),
  starting at a random offset so many sessions don't renew together. If the server
  drops you anyway, it closes with reason `'removed'`.
- **tracks participants** like an observer (`session.participants`,
  `session.participant(userId)`, `join`/`leave`/`update` events). Inside a session,
  outfit and seat changes come from the chat itself (below) rather than from
  re-reading participants.
- **ignores the server's echo of your own lines** (`ignoreOwnMessages`).
- **closes once**, with a `close` event whose `reason` is `'left'`, `'booted'` or
  `'removed'`.

### The sender is the envelope, not the payload

Each chat line is JSON (`{chatId, message, to, userId}`) sent by the other person's
client, which can write anything in `userId`. The session takes the sender from the
IMQ envelope, which the server sets. If you use `@imvu/imq` directly, do the same.

### Legacy commands in chat

Clients also announce state as chat lines starting with `*`. The session decodes the
common ones into events instead of `message`:

| Line                                           | Event                                     |
| ---------------------------------------------- | ----------------------------------------- |
| `*putOnOutfit <pid> <pid> …`                   | `outfit` `{userId, productIds}`           |
| `*msg SeatAssignment <n> <cid> <seat> <furni>` | `seat` `{userId, seatNumber, furniId}`    |
| `*boot <booter> <target>`, `*imvu:txnBoot <target>` | `boot`, plus `booted` if you're the target |
| anything else (`*use …`, `*imvu:isPureUser`, …) | `command` `{userId, command, args}`       |

Clients re-send their outfit and seat every 15 to 60 seconds and whenever someone
new arrives, so a session learns everyone's outfit without extra requests.

### Being booted, and booting

**Booting is enforced by clients, not the server.** The booter's client announces
it in chat and deletes the target's participant record. A well-behaved client leaves
when it sees itself named. Sessions do: they emit `booted` and leave, unless you pass
`{ leaveWhenBooted: false }`.

`session.boot(userId)` does the same as the web client: it announces the boot and
deletes the target's participant record. That last step is what actually removes
them, and it needs owner or moderator rights in the room.

## Things to expect

- **Full rooms.** Room lists show occupancy that can lag, so a join can fail with
  `IMVUAPIError` code `CHAT_PARTICIPANT-002` even when the room looked open.
  (`-001` also means full; `-004` means unavailable.)
- **Automated room owners.** Some rooms boot unfamiliar accounts within seconds of
  joining.
- **Rate limits.** IMVU limits how fast an account can chat, and flooding can get an
  account flagged. Pace what you send; [`@imvu/bot`](/packages/bot/) does this for you.
- **Proof of work.** IMVU may challenge a busy session with `VERIFY-001`; the client
  solves the challenge and retries the request automatically (see
  [Handling errors](/guide/errors#proof-of-work)).

## See also

- [Watch a room](/recipes/watch-room): a runnable observer.
- [Build a bot](/recipes/bots): commands and many rooms with `@imvu/bot`.
- [IMs](/guide/ims): private and group conversations.
- [Realtime updates](/guide/realtime): how IMQ and invalidation work underneath.
