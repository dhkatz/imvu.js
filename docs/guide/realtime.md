# Realtime updates

IMVU pushes change notifications over IMQ, its websocket service. `@imvu/client` uses
it only when you ask: ordinary fetches never open a connection.

## Watching a resource or collection

Call `watch()` on anything that supports it. You get back a `DocumentWatch` that
fires `invalidate` whenever the server says the document changed:

```ts
const wishlist = client.account.wishlist.list();
const watch = await wishlist.watch();

watch.on('invalidate', async ({ document, revision, receivedAt }) => {
  // Something changed. Read again to see what.
  const total = await document.count();
  console.log(`wishlist now has ${total} items (change #${revision})`);
});

// When you're done:
watch.close();
```

The first `watch()` opens the IMQ connection, using the details of the logged-in
session. Later watches share it.

### Invalidations say *that* something changed, not *what*

An invalidation carries no data. It increments the document's `revision` and sets
`stale = true`, and leaves the next step to you:

- **For a resource**, read it again with `refresh()`. Because resources are
  [canonical](/guide/concepts#resources), that updates the very object you already
  hold, and `stale` resets to `false`. A stale resource is also never served from the
  [cache](/guide/caching), so a plain `fetch()` re-reads it too:

  ```ts
  const user = await client.users.fetch(id);
  const watch = await user.watch();
  watch.on('invalidate', () => user.refresh()); // `user` is now fresh
  ```

- **For a collection**, read the range you care about again (`page()`, `count()` or
  `for await`). Collections never cache their membership, so every read is fresh.

Several invalidations can arrive close together. If re-reading is expensive,
debounce it.

## What can be watched

Only documents whose API response advertises an update channel can be watched. Check
before you rely on it:

```ts
import { CollectionNotWatchableError } from '@imvu/client';

try {
  const watch = await collection.watch();
} catch (error) {
  if (error instanceof CollectionNotWatchableError) {
    // This endpoint doesn't publish updates. Poll it instead.
  } else {
    throw error;
  }
}
```

After a collection has been read, `collection.watchability` tells you without
throwing: `'supported'`, `'unsupported'`, or `'unknown'` if it hasn't been read yet. For
a resource, `resource.updateTarget` is `null` when it can't be watched.

## Connection problems

The IMQ connection keeps itself alive and reconnects with backoff. Notifications sent
while it was down are lost, so **after a reconnect every watched document is
invalidated** once. Your normal `invalidate` handler then re-reads everything, and
nothing is silently missed.

Connection errors are emitted on the client:

```ts
client.on('imqError', (error) => console.warn('IMQ:', error.message));
```

Closing every watch on a document releases its subscription. `client.logout()`
closes them all along with the connection.

## Rooms

Room presence and chat are built on the same connection: `chat.observe()` follows
who is in a room, and `room.join()` takes part in it. See
[Rooms and chat](/guide/rooms).

For your own subscriptions on the shared connection, `client.realtime.listen(queue,
mount, listener)` delivers every message on a mount (sender and payload), and
`client.realtime.send()` sends one. `client.realtime.onReconnect(listener)` tells you
when to resynchronize.

## Using `@imvu/imq` directly

To see raw traffic (chat queues, state mounts, presence), use `IMQManager` yourself.
It needs the IMQ URL and session id from `/login/me`:

<<< ../../examples/imq-listen.ts

A **queue** groups **mounts**. *Message* mounts deliver a stream of messages, and
*state* mounts hold a key → value map that changes over time. Subscribe to a queue to
discover its mounts as they appear, or go straight to one you already know with
`manager.subscribeMessage(queue, mount)` / `manager.subscribeState(queue, mount)`. The
manager emits `status` on every connection change (`connecting`, `authenticating`,
`connected`, `disconnected`).
