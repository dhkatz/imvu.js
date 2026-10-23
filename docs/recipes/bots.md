# Build a bot

[`@imvu/bot`](/packages/bot/) runs a chat bot in one room or hundreds. It handles
commands, permissions and rate limits so your code only says what each command does.
The bot account is visible in every room it joins, and everyone sees what it says.

## A complete bot

<<< ../../examples/bot.ts

Run it with `node --env-file=.env examples/bot.ts 123456-1 654321-2`, or
`--managed` to join every room the account moderates.

## The pieces

**Messages.** Every message has:

- `author`, the sender's full `User`, from the [cache](/guide/caching);
- `participant`, their presence in the room (outfit, seat, join time);
- `source`, the room it came from.

`message.reply()` answers in kind: a whisper gets a whisper back.

```ts
bot.on('message', (message) => {
  if (message.source.type === 'room') console.log(`[${message.source.name}] ${message.author.username}: ${message.text}`);
});
```

**Commands.** `bot.command(name, options?, handler)`:

- the handler gets `ctx.args` (quoted words stay together), `ctx.author`,
  `ctx.participant`, `ctx.source` and `ctx.role`;
- the options are `aliases`, `description`/`usage` (shown by the built-in `!help`),
  `permission`, `cooldown` (ms per user) and `sources`.

**Roles.** Permissions use the author's role in that room:

- `everyone`;
- `moderator`: the room's moderator list;
- `owner`: the room owner;
- `admin`: the ids you pass as `admins`.

Each role includes the ones below it. For anything else, pass a function:
`permission: (ctx) => myAllowList.has(ctx.author.id)`.

**Middleware.** `bot.use((ctx, next) => …)` runs before every command. Use it for
logging, ban lists or per-room settings. Skip `next()` to stop the command.

**Many rooms.** `bot.joinAll(ids)` joins at a set pace and returns
`{ joined, failed }`, so full rooms don't throw. `bot.rooms` is a map of the rooms
the bot is in, and each room's `participants` is a live map of who is there.

**Staying polite.**

- What the bot says is rate limited per room (`rateLimit`) and across the account
  (`globalRateLimit`).
- If the server drops the bot, it rejoins with backoff.
- After a boot it stays out, unless you set `rejoin.afterBoot`.

**Errors.** Listen for `error`: it is the only place failures are reported.

## Responding to room activity

```ts
bot.on('participantJoin', (participant, room) => void room.say(`Welcome, ${participant.user?.username}!`));
bot.on('participantUpdate', (participant, changes, room) => {
  if (changes.includes('outfit')) console.log(`${participant.userId} changed clothes in ${room.name}`);
});
bot.on('booted', (room, by) => console.log(`Booted from ${room.name} by ${by}`));
```

## Coming next

IMs (private messages) are planned as a second `source` type, so the same commands
will work in both. Until then, `source.type` is always `'room'`. Check it anyway, so
your code keeps working when IMs arrive.
