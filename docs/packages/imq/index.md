# @imvu/imq

A client for IMQ, IMVU's realtime websocket service behind chat, notifications and
live document updates. It runs on the standard `WebSocket`.

```sh
npm install @imvu/imq
```

## Example

Authenticate with [`@imvu/rest`](/packages/rest/), connect with the IMQ details from
`/login/me`, and log a queue's events
([`examples/imq-listen.ts`](https://github.com/dhkatz/imvu.js/blob/master/examples/imq-listen.ts)):

<<< ../../../examples/imq-listen.ts

`@imvu/client` manages an `IMQManager` for you: its resources' `watch()` methods open
subscriptions only when you ask for them.

---

Every export is listed in the [API reference](/api/@imvu/imq/).
