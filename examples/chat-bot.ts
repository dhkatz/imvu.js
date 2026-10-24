/**
 * @imvu/client — a minimal chat bot: join a room, answer `!ping` and `!outfit`, and
 * greet people who arrive. Everyone in the room sees the bot and what it says.
 *
 *   node --env-file=.env examples/chat-bot.ts <roomId>
 *
 * Room ids look like `123456-1` (the end of a room URL).
 */
import { Client } from '@imvu/client';

const username = process.env.IMVU_USERNAME;
const password = process.env.IMVU_PASSWORD ?? '';
const roomId = process.argv[2];

if (!username || !roomId) {
  console.error('Usage: node --env-file=.env examples/chat-bot.ts <roomId> — see examples/README.md');
  process.exit(1);
}

const client = new Client();
await client.login(username, password);

const room = await client.rooms.fetch(roomId);
if (!room) {
  console.error(`No room ${roomId}`);
  process.exit(1);
}

const session = await room.join();
console.log(`Joined "${room.name}" with ${session.participants.size} people present.`);

session.on('message', (message) => {
  if (message.whisper && !message.toMe) return;
  // Answer privately when whispered to, publicly otherwise.
  const reply = (text: string) => (message.toMe ? session.whisper(message.userId, text) : session.send(text));

  let answer: string | undefined;
  if (message.text === '!ping') answer = 'pong';
  if (message.text === '!outfit') {
    const products = session.participant(message.userId)?.productIds ?? [];
    answer = `You are wearing ${products.length} products.`;
  }
  if (answer) reply(answer).catch((error: Error) => console.error('reply failed:', error.message));
});

session.on('join', (participant) => console.log(`${participant.userId} joined`));
session.on('leave', ({ userId }) => console.log(`${userId} left`));
session.on('booted', ({ by }) => console.log(`Booted by ${by}`));
session.on('close', ({ reason }) => {
  console.log(`Session closed: ${reason}`);
  client.realtime.close();
  process.exit(0);
});
session.on('error', (error) => console.error('session error:', error.message));

console.log('Press Ctrl+C to leave.');
process.on('SIGINT', () => void session.leave());
