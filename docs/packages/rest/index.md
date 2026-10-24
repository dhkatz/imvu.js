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

`REST` also:

- **solves proof-of-work challenges** when given a solver
  (`new REST({ proofOfWork })`), retrying requests rejected with `VERIFY-001`. See
  [Handling errors](/guide/errors#proof-of-work).
- **reports every successful response** through `onResponse`, including the documents
  it embeds; `@imvu/client` builds its [cache](/guide/caching) from these.
  `normalizeDocument(url, node)` turns one embedded entry into a document.
- **returns edges with collections.** `rest.collection()` returns `items` (each edge
  followed to its target) and `edges` (the edge documents themselves, which some
  collections, like chat participants, keep their data on).

---

See also: [Authentication and sessions](/guide/authentication), [Calling unmodeled endpoints](/recipes/raw-api), [Running in the browser](/guide/browser).

Every export is listed in the [API reference](/api/@imvu/rest/).
