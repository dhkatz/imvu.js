# @imvu/bot

Build IMVU chat bots on top of [`@imvu/client`](https://dhkatz.github.io/imvu.js/packages/client/), for one room or hundreds, and
for IMs: the same commands answer in rooms and in private or group conversations, with
permissions and cooldowns, middleware, rate limiting per source and per account, paced
joins, and rejoining when the server drops the bot.

```ts
import { Bot } from '@imvu/bot';
import { Client } from '@imvu/client';

const client = new Client();
await client.login(username, password);

const bot = new Bot({ client, admins: [myCid] });

bot.command('ping', (ctx) => ctx.reply('pong'));

bot.command('skip', { permission: 'moderator', sources: ['room'], cooldown: 10_000 }, async (ctx) => {
  await radio.skip(ctx.source.id);
  await ctx.reply(`Skipped for ${ctx.author.username}.`);
});

bot.on('participantJoin', (participant, room) => void room.say(`Welcome, ${participant.user?.username}!`));
bot.on('error', (error, source) => console.error(source?.name, error));

const { joined, failed } = await bot.joinAll(['123456-1', '654321-2' /* … */]);
```

## The model

The comparison with discord.js:

| discord.js                          | @imvu/bot                                                 |
| ----------------------------------- | --------------------------------------------------------- |
| `Client`                            | `Bot`: one logged-in account and one realtime connection  |
| `Guild`, `client.guilds.cache`      | `BotRoom`, `bot.rooms` (a map by room id)                 |
| `GuildMember`, `guild.members`      | `ChatParticipant`, `room.participants` (a map by user id) |
| `message.author` / `message.member` | `message.author` (a full `User`) / `message.participant`  |
| `message.guild` / `message.channel` | `message.source`: a `BotRoom` or a `BotConversation` (IM) |
| DM channels                         | `bot.conversations` (a map by conversation id)            |

- **`message.author` is always a full `User`.** Participant lists embed every user, so
  authors come from the cache. A user is only fetched (once, shared) when a line
  arrives before their join has been seen.
- **`message.participant`** is the author's presence in the room: join time, seat,
  outfit (`productIds`), `user`. It is null for IMs, and when not known yet.
- **`message.source`** says where the message came from: `source.type` is `'room'` or
  `'conversation'`. Both have `id`, `name`, `say()`, `whisper()` and `roleOf()`.
  Rooms add participants and `boot()`; conversations add `group` and the underlying
  `conversation`.

## IMs

The bot answers IMs by default (`ims: false` turns that off). Joining a room starts
it; a bot that is in no rooms calls `await bot.start()`.

- **Commands run in both kinds of source.** Restrict one with `sources: ['room']` or
  `sources: ['conversation']`.
- **`ctx.reply()` answers in the conversation**, and `ctx.whisper()` sends a separate
  one-to-one IM when the conversation is a group.
- **Roles in IMs:** there are no room roles, so the author is `admin` (your `admins`)
  or `everyone`.
- Accounts without a verified email can only start conversations with friends
  (`RATE-001`). Bot accounts should verify their email. Whether an unverified account
  may reply in a conversation someone else started hasn't been tested.

## Commands

- `!name arg "quoted words"` gives `ctx.args` `['arg', 'quoted words']`; `ctx.argText`
  is the raw text. The prefix is configurable (`prefix`, default `!`), names are
  case-insensitive, and `aliases` add more names.
- **`ctx.reply(text)` answers in kind**: a whisper to the bot gets a whisper back,
  public chat a public reply. `ctx.whisper(text)` always whispers.
- **`sources`** restricts where a command runs (`['room']`, `['conversation']`), and
  narrows `ctx.source` in its handler: a room-only command gets a `BotRoom`, with no
  type checks needed.
- **Permissions** are roles in the message's source, each including the ones below:
  - `everyone`;
  - `moderator`: the room's moderator list, re-read every `moderatorCacheMs`;
  - `owner`: the room owner;
  - `admin`: your `admins`, everywhere.

  Pass a function for custom checks. Refusals emit `denied`.

- **`cooldown`** (ms) limits each user per command per room; admins are exempt.
- **Middleware**, `bot.use((ctx, next) => …)`, runs before every command, in order.
  Skip `next()` to stop the command.
- A built-in `help` lists what the caller may run there (`help: false` drops it).
- Messages are handled in arrival order per room. Handlers run independently, so a
  slow command doesn't hold up the next. Handler errors emit `commandError`, or
  `error` when nothing listens for that.

## Many rooms

- **`bot.joinAll(ids)`** joins through a paced queue (`joinInterval`, default 1.5 s)
  and returns `{ joined, failed }`. Full rooms (`CHAT_PARTICIPANT-002`, common because
  room-list occupancy lags) and missing rooms end up in `failed` rather than throwing.
  `bot.join(id)` is the single-room form, and both return the existing room if the
  bot is already there. `client.account.rooms.managed()` lists the rooms the account
  moderates.
- **Two budgets for everything the bot says**: per room (default 3 lines per 5 s, at
  most `maxQueue` = 20 waiting) and per account across all rooms (`globalRateLimit`,
  default 20 lines per 10 s). IMVU rate-limits chat, and an account that floods can be
  flagged. When a room's queue is full, sends reject instead of backing up.
- **Built to scale:**
  - Presence keepalives start at random offsets, so rooms don't renew in lockstep.
  - In joined rooms, outfit and seat changes come from the chat broadcasts everyone
    already sends, not from re-reading participants.
  - Authors come from the cache.
  - All rooms share one realtime connection.
- **Rejoining:** if the server drops the bot (expired presence, network trouble), it
  rejoins after 5 s, 15 s and 60 s (`rejoin.delays`) and emits `roomRejoin`. After a
  boot it stays out unless `rejoin.afterBoot` is set. When it is out for good it
  emits `roomLeave`.
- **Room events**, each with the room: `participantJoin`, `participantLeave`,
  `participantUpdate` (outfit and seat changes), `booted`, plus `message` for every
  line.

**Listen for `error`.** Errors are only reported through that event, so a bot
without an `error` listener fails silently.
