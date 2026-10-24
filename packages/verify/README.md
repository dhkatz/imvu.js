# @imvu/verify

Prove that someone owns an IMVU account: issue a short code, have them put it in their
tagline, then check that it is there. Stateless: the token you hand out carries
everything needed to check it later, so there is nothing to store between the two
steps. What happens after a successful check (saving the link, how long it lasts) is up
to you.

No dependencies and no Node-only APIs (WebCrypto and `fetch`), so it runs in Node ≥ 22
and in browsers.

```ts
import { createChallenge, verifyChallenge } from '@imvu/verify';

// 1. Issue: show `code` to the user, keep `token` (in the page, a cookie, anywhere).
const { code, token } = await createChallenge({
  secret: process.env.VERIFY_SECRET!, // ≥ 16 bytes; keep it server-side
  userId: 123456789, // the IMVU account they claim (cid)
  subject: 'site-user-42', // who is asking, in your terms
});
// "Put IMVU-7F3K-92QD in your IMVU tagline, then press Verify."

// 2. Check, when they press Verify.
const result = await verifyChallenge({
  secret: process.env.VERIFY_SECRET!,
  token,
  maxAge: 30 * 60_000, // optional; otherwise expiry is yours to decide
  expect: { subject: 'site-user-42' }, // optional; the session that is verifying
});

if (result.ok) {
  // Save (result.userId ↔ result.subject). They can remove the code now.
} else {
  result.reason; // 'code-not-found' | 'expired' | 'mismatch' | 'invalid-token' | 'user-not-found'
}
```

## How it works

- The token is `v1.<payload>.<mac>`. The payload holds the user id, the optional
  subject, the issue time and a random nonce, signed with HMAC-SHA-256 under your secret.
  The code is the first 40 bits of the MAC in Crockford base32 (no I, L, O or U), so
  it is easy to read and type, and matching ignores case, spacing and look-alike
  characters.
- **Every challenge is different**, even for the same user and secret. A code that
  is still sitting in someone's tagline from an earlier verification cannot satisfy a
  new claim, and two people claiming the same account at once get different codes.
- **`subject` binds the proof to whoever asked.** The proof then means "IMVU account
  X agrees to be linked to _subject_", not just "someone controls X".
- **Checking is a single fresh read** of the user's profile when you call
  `verifyChallenge`. There is no polling or subscription. If the lookup fails (network,
  rate limit) the call rejects, so an unknown outcome is never reported as
  `code-not-found`.
- Because nothing is stored, a token keeps verifying until it expires (your `maxAge`
  or your own policy). If you need single use, record the token once it succeeds.

## Where the code is read from

By default `verifyChallenge` reads the tagline with `taglineLookup()`, an anonymous
GET of `https://api.imvu.com/user/user-<id>` (taglines are public; no login needed).
Verified live: a tagline change is visible to that read immediately.

In a browser on any origin other than www.imvu.com the API's CORS policy blocks that
read, so pass a proxy: `taglineLookup({ baseURL: 'https://your-proxy.example' })`. You
can also supply any `lookup(userId) => Promise<string | null>` to check other public
text.

`readChallenge({ secret, token })` validates a token and returns its code and claims
without looking at the profile, for example to show the code again.
