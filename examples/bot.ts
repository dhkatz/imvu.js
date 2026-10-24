/**
 * @imvu/bot — one bot in many rooms and in IMs: the same commands in both, with
 * permissions and cooldowns, rate limiting, paced joins, rejoining. Everyone in those
 * rooms sees the bot and what it says.
 *
 *   node --env-file=.env examples/bot.ts <roomId> [roomId …]
 *   node --env-file=.env examples/bot.ts --managed        # every room the account moderates
 *   node --env-file=.env examples/bot.ts --ims            # IMs only, no rooms
 *
 * Set BOT_ADMINS to a comma-separated list of cids allowed every command.
 */
import { Bot } from '@imvu/bot';
import { Client } from '@imvu/client';

const username = process.env.IMVU_USERNAME;
const password = process.env.IMVU_PASSWORD ?? '';
const args = process.argv.slice(2);

if (!username || args.length === 0) {
  console.error('Usage: node --env-file=.env examples/bot.ts <roomId …> | --managed | --ims — see examples/README.md');
  process.exit(1);
}

const client = new Client();
await client.login(username, password);

const bot = new Bot({ client, admins: (process.env.BOT_ADMINS ?? '').split(',').filter(Boolean) });

bot.command('ping', { description: 'Check the bot is alive' }, (ctx) => ctx.reply('pong'));

// `ctx.author` is the full User; `ctx.participant` their presence in this room.
bot.command('outfit', { description: 'Count what you are wearing', cooldown: 30_000, sources: ['room'] }, (ctx) => {
  const count = ctx.participant?.productIds.length ?? 0;
  return ctx.reply(`${ctx.author.displayName || ctx.author.username}, you are wearing ${count} products.`);
});

bot.command('rooms', { description: 'Where the bot is', permission: 'admin' }, (ctx) =>
  ctx.reply(`In ${bot.rooms.size} rooms: ${[...bot.rooms.values()].map((room) => room.name).join(', ')}`)
);

bot.command(
  'boot',
  { description: 'Boot someone', usage: '<cid>', permission: 'moderator', sources: ['room'] },
  async (ctx) => {
    const target = ctx.args[0];
    if (!target) return ctx.reply('Usage: !boot <cid>');
    if ((await ctx.source.roleOf(target)) !== 'everyone') return ctx.reply('I will not boot staff of this room.');
    await ctx.source.boot(target);
  }
);

bot.on('roomJoin', (room) => console.log(`+ ${room.name} (${room.participants.size} present)`));
bot.on('roomLeave', (room, reason) => console.log(`- ${room.name}: ${reason}`));
bot.on('participantJoin', (participant, room) =>
  console.log(`  ${participant.user?.username ?? participant.userId} joined ${room.name}`)
);
bot.on('message', (message) => {
  if (message.source.type === 'conversation') console.log(`  IM from ${message.author.username}: ${message.text}`);
});
bot.on('denied', (ctx) => console.log(`  ${ctx.author.username} may not run !${ctx.command} in ${ctx.source.name}`));
bot.on('error', (error, source) => console.error(`error${source ? ` in ${source.name}` : ''}:`, error.message));

await bot.start(); // answer IMs, even with no rooms
console.log('Answering IMs.');

const targets = args.includes('--managed') ? await managedRooms() : args.filter((arg) => !arg.startsWith('--'));
if (targets.length > 0) {
  const { joined, failed } = await bot.joinAll(targets);
  console.log(`Joined ${joined.length} rooms.`);
  for (const { target, error } of failed)
    console.log(`Could not join ${typeof target === 'string' ? target : target.id}: ${error.message}`);
}

process.on('SIGINT', () => {
  void bot.stop().then(() => process.exit(0));
});

async function managedRooms(): Promise<string[]> {
  const ids: string[] = [];
  try {
    for await (const room of client.account.rooms.managed()) ids.push(room.id);
  } catch (error) {
    // Seen live: accounts that manage no rooms get REST_DISCOVER_001 rather than an empty list.
    console.error('Could not list managed rooms:', (error as Error).message);
  }
  return ids;
}
