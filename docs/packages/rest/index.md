# @imvu/rest

The low-level REST client that `@imvu/client` is built on: IMVU authentication,
session reuse, and typed access to the raw API envelopes, on the standard `fetch`.
Use it directly when you want plain JSON instead of modeled resources.

```sh
npm install @imvu/rest
```

## Example

Log in and read the raw `/login/me` envelope
([`examples/rest-basic.ts`](https://github.com/dhkatz/imvu.js/blob/master/examples/rest-basic.ts)):

<<< ../../../examples/rest-basic.ts

`REST` keeps the session's cookies in `./cookies.json` by default in Node (configure
with `cookiePath`, or `cookieStorage: null` for memory only) and reuses a cached
session when the username matches, so repeated runs don't log in again.

---

Every export is listed in the [API reference](/api/@imvu/rest/).
