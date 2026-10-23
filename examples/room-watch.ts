/**
 * @imvu/client — watch who joins and leaves a room, and what they wear, without
 * joining it (nobody in the room can see you).
 *
 *   node --env-file=.env examples/room-watch.ts [roomId]
 *
 * With no room id it picks the busiest public room from the "explore" list.
 */
import { Client, Room } from '@imvu/client';

const username = process.env.IMVU_USERNAME;
const password = process.env.IMVU_PASSWORD ?? '';

if (!username) {
  console.error('Set IMVU_USERNAME (and IMVU_PASSWORD) — see examples/README.md');
  process.exit(1);
}

const client = new Client();
await client.login(username, password);

const room = process.argv[2] ? await client.rooms.fetch(process.argv[2]) : await busiestPublicRoom(client);
const chat = await room?.chat();
if (!room || !chat) {
  console.error('No classic chat room found');
  process.exit(1);
}

const observer = await chat.observe();
const time = () => new Date().toLocaleTimeString();
console.log(`Watching "${room.name}" — ${observer.participants.length} present:`);
for (const participant of observer.participants) {
  // participant.user comes from the documents embedded in the participant list: no extra request.
  const name = participant.user?.username ?? participant.userId;
  console.log(`  ${name} since ${participant.created}, ${participant.productIds.length} products worn`);
}

observer.on('join', (participant) =>
  console.log(`${time()} + ${participant.user?.username ?? participant.userId} joined`)
);
observer.on('leave', ({ userId, participant }) =>
  console.log(`${time()} - ${userId} left (joined ${participant.created})`)
);
observer.on('update', (participant, changes) =>
  console.log(`${time()} ~ ${participant.userId} changed ${changes.join(' and ')}`)
);
observer.on('error', (error) => console.error('observer error:', error.message));

console.log('Press Ctrl+C to stop.');
process.on('SIGINT', () => {
  observer.close();
  client.realtime.close();
  process.exit(0);
});

/** The room lists are not modeled yet, so read one through the raw API. */
async function busiestPublicRoom(client: Client): Promise<Room | null> {
  const list = await client.request(`/room_list/room_list-${client.rest.cid}-explore/rooms`, {
    params: { room_type: 'chat', limit: 25 },
  });
  const rooms = Object.entries(list.denormalized)
    .filter(([url, node]) => /\/room\/room-/.test(url) && node.relations?.chat)
    .map(([url, node]) =>
      client.utils.deserialize(Room, {
        url,
        id: url.split('room-')[1],
        data: node.data,
        relations: node.relations ?? {},
        updates: null,
      })
    )
    .filter((candidate) => candidate.privacy === 'public')
    .sort((a, b) => b.occupancy - a.occupancy);
  return rooms[0] ?? null;
}
