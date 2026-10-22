---
'@imvu/client': minor
---

Add `client.xmlrpc`, which owns an `@imvu/xmlrpc` gateway session: it logs in lazily on first use, persists the session across runs (`./xmlrpc-session.json` by default), re-authenticates once when the server reports the session invalid, and paces calls to a minimum interval. `ClientOptions.xmlrpc` configures the gateway instance, session storage and pacing.
