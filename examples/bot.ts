/**
 * @imvu/bot — a room bot with commands, permissions and rate limiting. Everyone in
 * the room sees the bot and what it says.
 *
 *   node --env-file=.env examples/bot.ts <roomId> [adminCid]
 */
import { Bot } from '@imvu/bot';
import { Client } from '@imvu/client';

const username = process.env.IMVU_USERNAME;
const password = process.env.IMVU_PASSWORD ?? '';
const [roomId, admin] = process.argv.slice(2);

if (!username || !roomId) {
  console.error('Usage: node --env-file=.env examples/bot.ts <roomId> [adminCid] — see examples/README.md');
  process.exit(1);
}

const client = new Client();
await client.login(username, password);

const bot = new Bot({ client, admins: admin ? [admin] : [] });

bot.command('ping', { description: 'Check the bot is alive' }, (ctx) => ctx.reply('pong'));

bot.command('outfit', { description: 'Count what you are wearing', cooldown: 30_000 }, (ctx) => {
  const products = ctx.room.participants.find((p) => p.userId === ctx.userId)?.productIds ?? [];
  return ctx.reply(`You are wearing ${products.length} products.`);
});

bot.command('boot', { description: 'Boot someone', usage: '<cid>', permission: 'moderator' }, async (ctx) => {
  const target = ctx.args[0];
  if (!target) return ctx.reply('Usage: !boot <cid>');
  if ((await ctx.room.roleOf(target)) !== 'everyone') return ctx.reply('I will not boot staff of this room.');
  await ctx.room.boot(target);
});

bot.on('ready', (room) => console.log(`In "${room.room.name}" with ${room.participants.length} people.`));
bot.on('join', (_room, participant) => console.log(`${participant.userId} joined`));
bot.on('denied', (ctx) => console.log(`${ctx.userId} may not run !${ctx.command}`));
bot.on('closed', (room, reason) => {
  console.log(`Out of ${room.id}: ${reason}`);
  if (bot.rooms.length === 0) process.exit(0);
});
bot.on('error', (error) => console.error('bot error:', error.message));

await bot.join(roomId);

process.on('SIGINT', () => {
  void bot.stop().then(() => process.exit(0));
});
