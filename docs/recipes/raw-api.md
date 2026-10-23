# Calling unmodeled endpoints

The modeled API doesn't cover every IMVU endpoint. When you need one it lacks, the
client's escape hatches still give you its session, cookies, auth headers and error
handling.

## Raw JSON: `client.request()`

```ts
const response = await client.request('/login/me');
const node = response.denormalized[response.id];
node.data; // the document's fields
node.relations; // links to related documents (URLs)
```

IMVU responses are **denormalized**: `response.id` is the URL you asked for, and
`response.denormalized` maps URLs to documents, including related documents that came
along with it.

Options:

```ts
await client.request('/user', {
  params: { username: 'Alice' }, // query string; null/undefined are skipped
});

await client.request(`/user/user-${client.account.id}/wishlist`, {
  method: 'POST',
  data: { id: 'https://api.imvu.com/product/product-51522827' }, // JSON body
  signal: AbortSignal.timeout(10_000),
});
```

Writes (anything but `GET`/`HEAD`) automatically carry the auth headers IMVU
requires. Failures throw [`IMVUAPIError`](/guide/errors#api-errors-imvuapierror).

## One document: `client.resource()`

`resource()` digs the requested document out of the envelope for you:

```ts
const node = await client.resource('/room/room-12345678-1');
node.url; // canonical URL
node.id; // opaque id
node.data; // fields
```

Pass a resource class to get a modeled, [canonical](/guide/concepts#resources)
object instead:

```ts
import { User } from '@imvu/client';

const user = await client.resource('/user/user-12345678', User);
```

## Lists: `client.collection()`

Any URL that returns a list can be used as a [collection](/guide/concepts#collections),
with paging and `for await`:

```ts
import { Product } from '@imvu/client';

const list = client.collection(`/user/user-${client.account.id}/wishlist`, Product);
for await (const product of list) console.log(product.name);

// Without a class you get raw documents ({ url, id, data, relations })
const raw = client.collection(`/user/user-${client.account.id}/recent_rooms`);
const first = await raw.page({ limit: 5 });
```

## Without `@imvu/client`

`@imvu/rest` has the same methods (`request`, `resource`, `resources`,
`collection`), returning plain objects. Use it when you want speed or no classes,
for example in a renderer or an edge function:

```ts
import { REST } from '@imvu/rest';

const rest = new REST();
await rest.login(username, password);

const page = await rest.collection(`/user/user-${rest.cid}/friends`, { params: { limit: 50 } });
page.totalCount;
page.items.map((item) => item.data.username);
```

`REST` also takes a custom `fetch`, which is handy for logging, retries or routing
through a proxy:

```ts
const rest = new REST({
  fetch: async (input, init) => {
    console.debug(init?.method ?? 'GET', String(input));
    return fetch(input, init);
  },
});
```

If you end up wrapping an endpoint that others would find useful, consider
contributing it as a resource or manager.
