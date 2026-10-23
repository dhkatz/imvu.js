# Running in the browser

Every package is built on web-standard APIs (`fetch`, `WebSocket`, `TextDecoder`,
`DecompressionStream`), but *where* your code runs decides what IMVU lets it reach.

## File formats: anywhere

`@imvu/cal3d` and `@imvu/chkn` have no Node-only code. Parse files the user drops on
the page, or build a 3D viewer:

```ts
import { load } from '@imvu/cal3d';

input.addEventListener('change', async () => {
  const file = load(await input.files![0].arrayBuffer());
  console.log(file.kind);
});
```

Whether a browser page can *download* products straight from IMVU's CDN depends on
the CDN's CORS headers. If it can't, give `CdnProductSource` a `baseUrl` that points
at your own proxy, or a custom `fetch`:

```ts
const source = new CdnProductSource({ baseUrl: 'https://my-proxy.example/productdata', revisions });
```

## The IMVU API: same origin only

IMVU's API only accepts requests from `https://www.imvu.com`. A page on any other
origin is blocked by CORS. Your options:

- **A server-side proxy.** Run `@imvu/client` in Node on your server and expose what
  your page needs. This is the simplest and keeps credentials off the client.
  Alternatively, point `REST` at a proxy that forwards to `api.imvu.com`:
  `new REST({ baseURL: 'https://my-proxy.example/api' })`.
- **A browser extension** with host permissions for `api.imvu.com`.
- **A desktop shell** such as Electron or Tauri, where the request isn't subject to
  page CORS.

### What changes in a browser

- **Cookies belong to the browser.** Scripts can't read `Set-Cookie` or set `Cookie`,
  so `REST` sends requests with `credentials: 'include'`, lets the browser follow
  redirects, and ignores `cookiePath` and `cookieStorage`.
- **No session files.** The XML-RPC session isn't saved by default in a browser.
  Supply `xmlrpc: { sessionStorage }` (for example backed by `localStorage`) if you
  want it to survive reloads.
- **`EventEmitter`.** `@imvu/client` and `@imvu/imq` extend Node's `EventEmitter`
  (`events` / `node:events`). Most bundlers need to be told to use the
  [`events`](https://www.npmjs.com/package/events) package for it, for example in Vite:

  ```ts
  // vite.config.ts
  export default defineConfig({
    resolve: { alias: { 'node:events': 'events' } },
  });
  ```
