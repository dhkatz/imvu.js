# Core concepts

This page explains how `@imvu/client` is organized: where things live, what a
resource is, and how collections page through large lists. Once you know these few
ideas, the rest of the API is predictable.

## How the packages fit together

```
@imvu/bot ── chat bots across many rooms
   └── @imvu/client ── modeled API: resources, collections, managers, rooms and chat
         ├── @imvu/rest     HTTP + cookie session (api.imvu.com)
         ├── @imvu/imq      realtime websocket (used only when you watch or join something)
         └── @imvu/xmlrpc   legacy gateway (logged in only when you call it)

@imvu/verify ── account-ownership proofs (standalone; plain fetch)

@imvu/chkn ── product archives and templates
   └── @imvu/cal3d    the 3D model files inside them
```

`@imvu/client` is the entry point for anything account-related. Each layer below it is
usable on its own: reach for `@imvu/rest` when you want raw JSON, or `@imvu/chkn`
when you only need product files.

## The `Client`

A `Client` groups the API by what you are working with:

| Member                 | What it is                                                                     |
| ---------------------- | ------------------------------------------------------------------------------ |
| `client.users`         | Look up users: `fetch(id)`, `resolve(id)` (cache only) and `search({ username })`. |
| `client.products`      | Look up products: `fetch(id)`, `resolve(id)`.                                  |
| `client.rooms`         | Look up rooms: `fetch(id)`, `resolve(id)`. See [Rooms and chat](/guide/rooms). |
| `client.account`       | The logged-in account: wallet, friends, wishlist, gifts, rooms, inventory, and so on. |
| `client.xmlrpc`        | The legacy XML-RPC gateway (current product revisions).                        |
| `client.request()` etc | Escape hatches for endpoints the client doesn't model yet. See [Raw API](/recipes/raw-api). |

`client.account` exists only after `login()`. Reading it before then throws.

```ts
const client = new Client();
await client.login(username, password);

const me = client.account.user; // your own User
const bob = await client.users.fetch(12345678); // anyone else, by id
const [alice] = await client.users.search({ username: 'Alice' }); // or by username
```

## Resources

`User`, `Product`, `Room`, `ProfileUser`, `Creator`, `Avatar` and the rest are
**resources**: class instances built from the API's JSON. Field names are camelCased
(`display_name` becomes `displayName`), and the raw document's links become methods:

```ts
const user = await client.users.fetch(12345678);

user.username; // plain fields
user.isVip;

const profile = await user.profile(); // a related resource, or null
const wishlist = user.wishlist(); // a related collection (no request yet)
```

Two rules hold for every resource:

- **`id` is an opaque string.** Treat it as an identifier, not a number, even when it
  looks numeric. Most methods accept a resource, a numeric id or a string id
  interchangeably.
- **`url` is its identity.** Getting the same resource again, whether directly,
  through a relation, as part of a collection, or embedded in another response, gives
  you **the same object**, updated in place. Anything holding a reference to it sees
  the fresh data.

`fetch()` answers from memory when it already has the resource, so asking twice costs
one request. `resource.refresh()` or `fetch(id, { force: true })` re-reads it. Recently
used resources are kept (1,000 by default; see `maximumStrongDocuments`), and older
ones only while your code still references them. [Caching](/guide/caching) has the
details.

## Collections

Lists such as wishlists, friends, followers and inventories are `Collection`s. A
collection is a handle to a URL: creating one makes no request, and its items are
fetched fresh each time you ask. There are three ways to read one:

```ts
const wishlist = user.wishlist();

// 1. How many items? (asks for zero items, so it's cheap)
const total = await wishlist.count();

// 2. One bounded page.
const firstTen = await wishlist.page({ offset: 0, limit: 10 });

// 3. Everything, a page at a time. Stop whenever you like.
for await (const product of wishlist) {
  if (product.price > 1000) break;
}
```

`for await` fetches pages of 25 as it goes, so even a huge list never sits in memory
all at once. After any read, `collection.totalCount` holds the total the server
reported.

Membership is not cached: if the list may have changed, read it again. To find out
*when* it changes, [watch it](/guide/realtime).

## Results instead of exceptions

Operations whose failure is an expected outcome rather than a bug return a `Result`
instead of throwing:

```ts
const result = await client.account.gifts.send({ recipient, product });
if (result.ok) {
  console.log('sent', result.value.transactionId);
} else {
  console.error(result.error.kind, result.error.message);
}
```

The [errors guide](/guide/errors) lists which calls throw, which return `false`, and
which return a `Result`.
