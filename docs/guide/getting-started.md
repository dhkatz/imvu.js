# Getting started

imvu.js is a set of packages. Most applications only need [`@imvu/client`](/packages/client/);
the others are its building blocks or work with IMVU's product files.

| Package                             | Use it for                                                             |
| ----------------------------------- | ---------------------------------------------------------------------- |
| [`@imvu/client`](/packages/client/) | The modeled API: users, the current account, wishlists, gifts, rooms and chat. |
| [`@imvu/bot`](/packages/bot/)       | Chat bots: commands, permissions and rate limits across many rooms.    |
| [`@imvu/verify`](/packages/verify/) | Proving someone owns an IMVU account (a code in their tagline).        |
| [`@imvu/rest`](/packages/rest/)     | Raw REST requests with IMVU authentication, when you want plain JSON.  |
| [`@imvu/imq`](/packages/imq/)       | The IMQ websocket service directly (realtime queues and mounts).       |
| [`@imvu/xmlrpc`](/packages/xmlrpc/) | The classic client's XML-RPC gateway (e.g. current product revisions). |
| [`@imvu/chkn`](/packages/chkn/)     | Loading products: CFL/CHKN archives, `index.xml`, inherited assets.    |
| [`@imvu/cal3d`](/packages/cal3d/)   | The Cal3D model files inside products.                                 |

## Requirements

- **Node.js 22 or newer.** The packages use web-standard APIs (`fetch`, `WebSocket`,
  `TextDecoder`, `DecompressionStream`) and have few or no dependencies.
- **Browsers** work for the file-format packages (`@imvu/cal3d`, `@imvu/chkn`).
  IMVU's API only allows requests from `https://www.imvu.com`, so calling it from a
  third-party web page needs a proxy, a browser extension, or a desktop shell such as
  Electron.

## Install

```sh
npm install @imvu/client
```

## Log in and make a request

```ts
import { Client } from '@imvu/client';

const client = new Client();
await client.login(process.env.IMVU_USERNAME!, process.env.IMVU_PASSWORD!);

const [user] = await client.users.search({ username: 'IMVU' });
console.log(user?.username, user?.id);
```

In Node, logging in stores the session cookies (in `./cookies.json` by default; see
the `cookiePath` and `cookieStorage` options of `REST`) and reuses
them while they stay valid, so restarting your program does not log in again. IMVU
rate-limits logins: keep one session and reuse it rather than logging in per run.

## Examples

The repository's [`examples/`](https://github.com/dhkatz/imvu.js/tree/master/examples)
folder has runnable scripts. Here is the high-level client one:

<<< ../../examples/client-search.ts

## Next steps

- **Learn the model.** [Core concepts](/guide/concepts) covers resources, collections
  and paging, then [Authentication](/guide/authentication),
  [Realtime updates](/guide/realtime) and [Handling errors](/guide/errors).
- **Do something specific.** The recipes cover [users and profiles](/recipes/users),
  [your account](/recipes/account), [gifting](/recipes/gifting),
  [downloading products](/recipes/download-products),
  [Cal3D files](/recipes/cal3d) and [rendering with three.js](/recipes/rendering).
- **Look something up.** The [package pages](/packages/client/) describe each package,
  and the [API reference](/api/) lists every export.
