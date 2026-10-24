# Caching

`@imvu/client` keeps the resources it has seen in memory and answers repeat lookups
from there, much as discord.js does. A program that asks for the same user a hundred
times makes one request, not a hundred, so code that doesn't think about caching
still treats the API politely.

## Where cached data comes from

Every API response embeds related documents alongside the one you asked for: a
participant list carries each participant's user, a room list carries the rooms, and
so on. The client absorbs **all** of them:

- An object you already hold is updated in place.
- Users, products, rooms, chats and chat participants it doesn't hold yet are created
  and cached.

So the data often arrives before you ask for it:

```ts
const observer = await chat.observe(); // one request for the participant list…
for (const participant of observer.participants.values()) {
  participant.user?.username; // …and every participant's full User came with it
}
```

## `fetch()` reads the cache first

`client.users.fetch(id)` (and `products`, `rooms`, relationship methods such as
`user.profile()`, and `client.resource(url, Class)`) returns the cached instance when
there is a usable one, and only otherwise asks the API:

```ts
const a = await client.users.fetch(42); // request
const b = await client.users.fetch(42); // no request: a === b

await client.users.fetch(42, { force: true }); // always a request; updates `a` in place
await client.users.fetch(42, { maxAge: 60_000 }); // a request if the copy is over a minute old
```

A cached copy is **not** used when:

- it was invalidated over IMQ (`resource.stale` is true; see
  [Realtime updates](/guide/realtime)), or
- it is older than `maxAge`, or the client-wide `cacheMaxAge`
  (`new Client(rest, { cacheMaxAge: 5 * 60_000 })`). By default there is no age
  limit, as in discord.js.

Fetches of the same resource that overlap share one request.

Some reads are always fresh, because a cached answer would be wrong:

- `client.login()` reads your account;
- `resource.refresh()` re-reads that resource in place;
- collections (`page()`, `count()`, `for await`) list their members;
- the room observer re-reads a participant when they join;
- `client.request()` and the other raw calls.

## Reading only the cache

`resolve(id)` returns the cached instance, or `undefined`, without any request: the
counterpart of discord.js `manager.cache.get(id)`.

```ts
const user = client.users.resolve(42) ?? (await client.users.fetch(42));
```

`resource.fetchedAt` is when the instance last received data (milliseconds since
the epoch).

## How long things stay cached

The cache keeps the 1,000 most recently used resources (`maximumStrongDocuments`) and,
beyond that, anything your code still references. Objects you drop are eventually
garbage-collected, and a later `fetch()` reads them again. Long-running programs such
as bots therefore don't grow without bound. Hold on to what you need, and raise
`maximumStrongDocuments` if you want more kept warm.

Room observers hold the users of everyone present, so in a room you're watching,
`participant.user` stays available for as long as that person is there.

## Keeping data current

Cached data is only as fresh as the last response that carried it. When you need
current data, choose one of:

- `resource.refresh()` or `fetch(id, { force: true })` for a one-off fresh read;
- `{ maxAge }` / `cacheMaxAge` to bound staleness everywhere;
- `resource.watch()` to have IMQ tell you when it changes, so the next `fetch()`
  re-reads it (see [Realtime updates](/guide/realtime)).
