---
'@imvu/rest': minor
'@imvu/client': minor
---

Proof of work. `RESTOptions.proofOfWork` (a nonce → solution solver) lets `rest.request()` handle `VERIFY-001`: it solves the session's outstanding `/pow` challenges with `rest.solveChallenges()` — the web client's flow — and retries (up to `maxPowRetries`, default 3). `@imvu/client` supplies the RSW solver from `@imvu/xmlrpc` by default and routes XML-RPC fault 110 to the same challenges.
