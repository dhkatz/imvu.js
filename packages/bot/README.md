# @imvu/bot

Build IMVU chat-room bots on top of [`@imvu/client`](../client): commands with
permissions and cooldowns, middleware, a rate-limited outgoing queue, several rooms
at once, and rejoining when the server drops the bot.

```ts
import { Bot } from '@imvu/bot';
import { Client } from '@imvu/client';

const client = new Client();
await client.login(username, password);

const bot = new Bot({ client, admins: [myCid] });

bot.command('ping', { description: 'Check the bot is alive' }, (ctx) => ctx.reply('pong'));

bot.command('skip', { permission: 'moderator', cooldown: 10_000 }, async (ctx) => {
  await radio.skip();
  await ctx.reply('Skipped.');
});

bot.on('join', (room) => void room.say('Welcome!'));
bot.on('error', (error) => console.error(error));

await bot.join('123456-1'); // a room id: the end of the room's URL
```

## Commands

- `!name arg "quoted words"`: `ctx.args` is `['arg', 'quoted words']` and
  `ctx.argText` the raw text. The prefix is configurable (`prefix`, default `!`) and
  names are case-insensitive. `aliases` add other names.
- **`ctx.reply(text)` answers in kind**: a whisper to the bot gets a whisper back,
  public chat gets a public reply. `ctx.whisper(text)` always whispers.
- **Permissions** are room roles, each including the ones below it: `everyone`,
  `moderator` (the room's moderator list, re-read every `moderatorCacheMs`), `owner`
  (the room owner), `admin` (your `admins`, in every room). Pass a function for
  custom checks. Refusals emit `denied`.
- **`cooldown`** (ms) limits how often each user can run a command; admins are exempt.
- **Middleware** (`bot.use((ctx, next) => …)`) runs before every command, in order.
  Skip `next()` to stop the command.
- A built-in `help` lists the commands the caller may run (`help: false` to drop it).
- Commands are recognised in arrival order per room; handlers run independently, so
  a slow command doesn't hold up the next. Handler errors emit `commandError`, or
  `error` when nothing listens for that.

## Rooms

- `bot.join(roomIdOrRoom)` returns a `BotRoom` with `say`, `whisper`, `boot`,
  `participants` and `roleOf(userId)`. `bot.leave(id)` and `bot.stop()` leave.
- **Everything the bot says goes through a per-room queue**, by default 3 lines per
  5 s with at most 20 waiting (`rateLimit`, `maxQueue`). IMVU rate-limits chat, and an
  account that floods can be flagged. When the queue is full, sends reject instead of
  backing up.
- **Rejoining:** if the server drops the bot (expired presence, network trouble), it
  rejoins after 5 s, 15 s and 60 s (`rejoin.delays`) and emits `rejoined`. After a
  boot it stays out unless `rejoin.afterBoot` is set. When it is out for good it
  emits `closed`.
- Room events are forwarded with the room: `join`, `leave`, `update` (outfit/seat
  changes), `outfit`, `message`, `booted`.

**Listen for `error`.** Errors are only reported through that event, so a bot
without an `error` listener fails silently.
