# Verify account ownership

Use [`@imvu/verify`](/packages/verify/) to let someone prove an IMVU account is
theirs: you give them a code, they put it in their tagline, and you check. Nothing is
stored between the two steps, and checking needs no IMVU login.

## The flow

```ts
import { createChallenge, verifyChallenge } from '@imvu/verify';

const secret = process.env.VERIFY_SECRET!; // ≥ 16 bytes, server-side only

// 1. They say "I'm IMVU user 123456789".
const { code, token } = await createChallenge({ secret, userId: 123456789, subject: session.userId });
// Show: "Add IMVU-7F3K-92QD to your IMVU tagline, then press Verify."
// Keep `token`: in the page, a cookie, anywhere. It is signed, so it can't be altered.

// 2. They press Verify.
const result = await verifyChallenge({
  secret,
  token,
  maxAge: 30 * 60_000,
  expect: { subject: session.userId },
});

if (result.ok) {
  await db.links.insert({ imvuUser: result.userId, siteUser: result.subject, at: result.checkedAt });
  // Tell them they can remove the code now.
} else if (result.reason === 'code-not-found') {
  // Not there yet: let them try again.
}
```

## Choices that are yours

- **`subject`** ties the proof to whoever asked (your site's user id, a Discord id).
  Use it with `expect: { subject }` so a proof started by one person can't be
  completed by another.
- **Expiry.** `maxAge` rejects old tokens. Without it, a token works until you decide
  otherwise.
- **Single use.** Tokens are stateless, so one keeps verifying until it expires. If
  that matters, record the token (or `result.challenge`) when it succeeds and refuse
  repeats.
- **Where the code goes.** The default reads the tagline, which the web UI labels
  "BIO" and limits to 100 characters. Pass `lookup` to read other public text.
- **Errors.** A failed read (network, rate limit) rejects instead of returning
  `code-not-found`, so you can tell "not there" from "couldn't check".

Every challenge has a fresh code, even for the same user, so a code left in someone's
tagline from an earlier verification can't satisfy a new one.

In a browser on your own domain, IMVU's API refuses cross-origin reads. Run
`verifyChallenge` on your server, or pass `taglineLookup({ baseURL })` pointing at a
proxy.
