# Notification state lives in Knock, not SQLite

Cadence's notification system uses Knock (Free plan): route actions trigger workflows through `@knocklabs/node`, and the in-app feed — its items, read/seen state, badges and templates — lives in Knock, not in our SQLite file. We chose Knock over a self-built feed because the managed realtime feed is the one primitive this codebase has no cheap way to build: with no queue, scheduler or realtime server, a self-build caps at a `notifications` table, unread counts and on-load polling. The Free plan ($0, no card, 10k messages/mo, no hard cap) covers the whole feature list, and the README already expected it.

## Considered Options

- **Self-built feed (SQLite table + unread counts + on-load polling).** Rejected: fully local and atomic with the domain write, but no realtime, no batching, and every scrap of feed UX hand-rolled.
- **Hybrid (local table plus Knock).** Rejected: pays the mirroring cost without removing the local table — the worst of both.

## Consequences

User identity is mirrored into Knock (recipients identified inline by our user id, so triggers need no extra call), and notification state is provider-held: the Drizzle schema gains no notifications or preferences tables — per-event toggles live in Knock preference sets, enforced by Knock at trigger time — and moving off Knock later is a data export, not a query rewrite. Prebuilt feed components carry unremovable Knock branding on the Free plan; headless hooks avoid it. Until Knock's enhanced security mode is enabled, the publishable key can act as any user, so backend-signed user tokens are a go-live requirement — tolerable in a no-auth course demo. Email stays outside the system (the refund emails remain the only email), which also leaves Knock's digest/schedule capability largely unused; in-app batching remains available.
