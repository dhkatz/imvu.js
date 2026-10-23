---
'@imvu/verify': minor
---

New `@imvu/verify` package: stateless proofs that someone owns an IMVU account. `createChallenge` issues a short code (put in the user's tagline) and an HMAC-signed token binding the user id, an optional consumer-side subject, the issue time and a nonce; `verifyChallenge` checks the token and does one fresh, anonymous read of the tagline. Dependency-free and browser-capable (WebCrypto + `fetch`).
