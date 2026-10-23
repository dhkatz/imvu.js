# imvu.js Roadmap: bots, verification, history

_Started 2026-10-22. Companion to MODERNIZATION.md._

Three capabilities, each split into what the **libraries** (`packages/`) must support
and what is **built on top** (`apps/`). Rule of thumb: if two apps would need it, it
belongs in a package. Apps depend on packages, never the reverse.

```
packages/   published libraries (semver, changesets, docs site)
  rest, imq, xmlrpc, client, cal3d, chkn   existing
  verify    new: stateless account-ownership proofs
  bot       new: bot framework (commands, events, permissions, outbound rate limiting)
apps/       private ("private": true), deployable, never published
  bot-radio      example: chat commands control a room's radio stream
  bot-moderator  example: sits in rooms and enforces rules
  chronicle      room/user history: collector + store + API + web UI
examples/   single-file scripts that each show one API
```

Add `"apps/*"` to the root `workspaces`; changesets skips private packages.

## Protocol findings (2026-10-22)

Sources: static reading of the IMVU Next web bundle (`withme.min.js`) plus read-only
live probes with the test account. **[L]** = confirmed live, **[B]** = seen in the
bundle only.

### Rooms and chats

- Two room kinds. **Classic** rooms have a `chat` relation; **live** rooms
  (`supports_audience`) instead have a `hangout_experience` with audience/scene
  sections whose presence is IMQ _state_ (`participant.<cid>` keys, JSON string values,
  empty = left). [B] Everything below is about classic rooms unless noted.
- `room` → `chat` relation → `/chat/chat-<a>-<b>`. Chat data: `activity`, `capacity`,
  `imq_queue` (`/chat/<n>`), `imq_messages_mount` (`messages`), `last_updated`. [L]
- Room data includes `occupancy`, `capacity`, `privacy`, `type`, `is_friends_only`,
  `is_non_guest_only`, `is_age_verified`, `content_rating`, `language`. [L]
- Discovery: `GET /room_list/room_list-<myCid>-<lane>/rooms`, lanes `feature`,
  `explore`, `friends`, `favorite`, `recent`, `recommendation`; filters include
  `room_type` (`all`/`live`/`chat`), `keywords`, occupancy bounds, `language`,
  `hashtags`. Items are edges whose `ref` is the room; the rooms come back
  denormalized in the same response. [L]

### Presence and outfits

- `GET <chat>/participants` works **without joining**, for any logged-in account
  (anonymous: 401). [L] Each participant (`<chat>/participants/user-<cid>`, `ref` →
  user) has `created` (join time), `last_updated`, `seat_furni_id`, `seat_number`,
  `look_url`, `look_image`, `look_thumbnail`, `asset_url`, `outfit_gender`,
  `nft_product_ids`, `rendered_image`. [L]
- **Outfit = `look_url`**: `https://api.imvu.com/look/<id>%2C<id>%2C…` (URL-encoded
  comma-separated product ids). [L] Live rooms: `look_products` in the state value,
  hidden unless `is_look_visible_to_others`. [B]
- Realtime: participants edge advertises `updates: {queue: "inv:/chat/chat-<a>-<b>",
  mount: "edge:participants"}`. Subscribing (message mount) **without joining**
  delivers `{"action":"created"|"updated"|"deleted","objects":[participantUrl]}`.
  created = join, deleted = leave, updated = outfit/seat/keepalive. Verified: 26 events
  over 8 rooms in 120 s, matching REST diffs. [L] Rooms and users advertise
  `inv:/room/...`, `inv:/user/...` with mount `node` the same way. [L]
- Privacy: "Show Chat Room Location" is `is_current_location_hidden` (numeric, `99` =
  off); online status is `online` + `availability` (`DoNotDisturb` when hidden). No
  invisible mode. [B] Unknown whether hidden-location users are omitted from
  participant lists.

### Joining and chatting (bots)

- Join: `POST <chat>/participants` `{}` → 201, `Location: <chat>/participants/user-<cid>`.
  Keepalive: `POST {}` to own participant URL every 45 s. Leave: `DELETE` it. Writes
  carry `X-imvu-sauce` (`@imvu/rest` already sends it). Errors `CHAT_PARTICIPANT-001/002`
  (full), `-004` (unavailable). [B]
- Chat lines go over IMQ `sendMessage` to `imq_queue`/`imq_messages_mount`; payload is
  a JSON string `{chatId, message, to, userId}`; `to: 0` public, `to: <cid>` whisper.
  Sender identity is IMQ `user_id`, not the JSON. Incoming may carry `censor_reason`,
  `censor_text`. `/me` is sent verbatim; other commands become `*use …`,
  `*imvu:trigger …` and similar legacy `*` commands. [B] `@imvu/imq`'s codec already
  matches the wire format.
- Web clients rebroadcast `*putOnOutfit…`, seat and `*imvu:isPureUser` every 60 s and on
  new subscribers. [B]
- **Live join test (2026-10-22, non-AP test account, public 6/10 room, no chat sent):** [L]
  - Subscribing to `/chat/<n>` / `messages` **before joining delivered nothing** in
    20 s; chat content is gated on participation. After the join POST the same
    subscription went live, with no re-subscribe needed.
  - Join `POST <chat>/participants {}` → 201 with `Location`; keepalive
    `POST <participant> {}` → 200; leave `DELETE` → 204. No `VERIFY-001`/PoW was hit.
  - On join, every present client re-sent `*imvu:isPureUser`, `*putOnOutfit …`,
    `*use …` (seat) and `*msg …` (~38 chars, not yet decoded), then repeated them
    every ~15–60 s. So a bot gets everyone's outfit from chat as well as REST.
  - Payload `{chatId, message, to, userId}` confirmed. `chatId` is a string, `to` a
    number, and `userId` is **sometimes a string, sometimes a number**, so the server
    does not normalize it. Trust the IMQ envelope's `user_id`, never the JSON.
  - IMQ `subscriber` joined/left events on the messages mount give the live
    subscriber list and track `edge:participants` created/deleted.
  - Nobody reacted to a client that sent no outfit/seat broadcasts during ~66 s;
    long-run behaviour is still unknown.
- **Send test (2026-10-22, one "hi"):** [L]
  - `sendMessage(imq_queue, imq_messages_mount, {chatId, message, to: 0, userId})` was
    acked OK in 18 ms and **echoed back to the sender** 54 ms later. A bot must ignore
    its own echoes (by envelope `user_id`).
  - The payload `chatId` is the **`imq_queue` suffix** (`/chat/<n>` → `"<n>"`), not
    the numbers in the `/chat/chat-<a>-<b>` URL. Numeric `userId` was accepted.
- **Legacy `*` command formats:** [L]
  - `*putOnOutfit <pid> <pid> …`: space-separated product ids, avatar body first.
    `*use <same list>` follows it.
  - `*msg SeatAssignment <n> <cid> <seat_number> <seat_furni_id>`.
  - `*imvu:isPureUser` (no arguments).
  - Boot is two lines from the booter's client: `*imvu:txnBoot <targetCid>` then
    `*boot <booterCid> <targetCid>`.
- **Boot is client-driven:** in the send test, another participant's client booted
  the bot 3 s after it joined (automated). The server only dropped the bot at
  206 s, so a booted client is evidently expected to leave by itself when it sees
  `*boot … <self>`. `ChatSession` should treat that as a `booted` event and leave.
  The booter's follow-up participant DELETE either failed or was never sent. [L]
- **Keepalive timeout:** in a second room (no boot, `auto_boot_timeout: 120`), a
  participant that sent no keepalive was removed after ~225–243 s (polled every 20 s).
  The first run's 206 s agrees. So the server expires participants after roughly
  3.5–4 min without a keepalive, and the 45 s cadence leaves wide margin. The IMQ
  connection being open does not count as presence. [L]

### IMs, moderation, profile

- IMs: `/user/user-<me>/conversations` (`limit`, `unread_messages=true`). New:
  POST `{participants:[userUrl…], payloads:[{type:"text",content}]}`; reply: POST
  `{payloads}` to `<conversation>/messages`; mark read: save `{last_read_message_id}`.
  1024-char limit. No dedicated IM queue: arrival is via `inv:` invalidations. [B]
- Moderation: boot = chat `*imvu:txnBoot <cid>` then DELETE the target participant
  (owner boots anyone; moderators anyone but the owner; moderators are unbootable).
  Room moderators: POST `{id}` / DELETE on `<room>/moderators`. Live-room ban: POST
  `banlist` `{id, data:{duration}}`. Mute is client-side only. Block: POST
  `/user/user-<me>/blocked`. [B]
- `tagline` is on `/user/user-<id>` and **readable anonymously**. [L] The web UI calls
  it "BIO" and caps it at 100 chars; update with POST `/user/user-<me>` `{tagline}`. [B]
- Anti-abuse: `RATE-001` (message rate; also "verify email" for messaging non-friends),
  participant trust scores, and API-wide proof-of-work: any request failing with
  `VERIFY-001` makes the client fetch `/pow` challenges, solve them in a worker
  (`pow.min.js`, not yet analysed) and retry. [B]

### Still open

- PoW algorithm and difficulty, and whether long-running sessions hit `VERIFY-001`.
- How many `inv:` subscriptions one IMQ connection may hold, plus any throttling.
- Whether hidden-location users appear in participant lists.
- Server-side chat flood limits; whether skipping outfit/seat broadcasts matters over
  hours; whether rooms commonly auto-boot clients that never send them.
- What `auto_boot_timeout` governs (120 s here, but it didn't remove a silent
  participant at 120 s).
- Live-room state value JSON and queue names.

## Plan

**Status (2026-10-22):**

- **Step 1 (`@imvu/verify`):** built and verified live (a tagline change is visible to the anonymous read immediately).
- **Step 2:** the room-chat core is built and verified live: `Room.chat()/join()`, `Chat.participants()/observe()/join()`, `ChatParticipant`, `ChatSession`, `Resource.refresh()`, and `User.tagline` plus the other new user fields.
- **Not started:** IMs, moderator management, the PoW (`VERIFY-001`) handler, live rooms, and steps 3–4.
- **Fixed along the way:** `rest.collection()` followed edge `ref`s, which drops participant data. Collections can now keep edges (`{ items: 'edge' }`).

### 1. Verification → `@imvu/verify` (independent, ship first)

Stateless HMAC challenge; the consumer owns storage and expiry policy.

- `createChallenge({ secret, userId, subject })` → `{ code, token }`. The token is
  `base64url(cid | issuedAt | nonce | subject | mac)`; the code is a short readable
  cut of the MAC (e.g. `IMVU-7F3K-92QD`).
- `verifyChallenge({ secret, token, fetchTagline, maxAge? })` → `{ ok, userId,
  subject, issuedAt, checkedAt }` or `{ ok: false, reason }`.
- The nonce makes every challenge unique, so a stale code left in a tagline can't
  satisfy a later claim, and two people racing to claim one account get different
  codes. `subject` (the consumer's own user id) binds the proof to whoever asked.
  Stateless means a token re-verifies until expiry; consumers wanting single use
  store the nonce.
- WebCrypto only (isomorphic). Tagline reads need no login, so `fetchTagline` can be
  a plain `fetch`; `@imvu/client` supplies an adapter once `User.tagline` exists.
- Checking is a single fresh read, made when the consumer calls `verifyChallenge`
  (e.g. on the user's "I've added it" click). No polling or subscription in the core.
  An optional `waitForCode()` helper can watch `inv:/user/user-<id>` / `node` when
  logged in and re-read on each invalidation, falling back to slow polling when
  anonymous.
- Core prerequisites: model `tagline` (and `interests`, `availability`, `online`) on
  `User`. Freshness is already handled, because `client.users.fetch()` /
  `client.resource()` always hit REST and the identity map only provides object
  identity. A `resource.refresh()` convenience (re-read and hydrate in place) would
  also pair naturally with `watch()` marking documents stale.

### 2. `@imvu/client` realtime rooms (the core for bots and history)

- `Chat` resource fully modelled (queue/mount fields), `ChatParticipant` resource
  (`created`, seat, `lookUrl` → `productIds`), `room.chat()`, `chat.participants()`.
- Observe without joining: `chat.observe()` → typed `join` / `leave` / `update` events
  from `edge:participants` invalidations, each resolved to a fresh participant read.
  Resync (full diff) after IMQ reconnects.
- Join: `chat.join()` → `ChatSession` with `send(text, { to })`, `leave()`, a
  keepalive timer, and `message` events decoded from the messages mount.
- `client.account.conversations` for IMs; moderation (`boot`, moderators) on
  `Room`/`ChatSession`.
- Transport hardening: PoW (`VERIFY-001`) solve-and-retry in `@imvu/rest`, IMQ
  reconnect with resubscribe, and never re-login in a loop (login rate limit).

### 3. `@imvu/bot`

Command router (prefix, args, aliases, help), middleware, role-based permissions
(owner / moderator / allowlist), outbound queue with rate limiting (avoid `RATE-001`
and account flags), multi-room, lifecycle hooks, reconnect. Then `apps/bot-radio` and
`apps/bot-moderator` as consumers that prove the API.

### 4. `apps/chronicle`

- Collector: pick public rooms from `room_list`, observe them with `chat.observe()`
  (no joining needed), record visits as intervals `(room, user, enteredAt, leftAt)` and
  outfits as product-set hashes, deduplicated.
- SQLite first; HTTP API and web UI on top.
- Design the observation record format early so independent collectors can
  contribute later.
- Privacy from day one: public rooms only, respect hidden location/online settings,
  an opt-out (proved with `@imvu/verify`), configurable retention. Review IMVU's ToS on
  automated collection before announcing.
