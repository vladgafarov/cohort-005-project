# Research: Knock fit for Cadence's notification infra

- **Ticket:** #2 (part of wayfinder map #1; feeds the Infra & channels decision, #5)
- **Date:** 2026-11-26
- **Question:** What can Knock's free Developer tier actually deliver for Cadence, and what would the self-built alternative cost?
- **Method:** Primary sources only — [knock.app/pricing](https://knock.app/pricing), [docs.knock.app](https://docs.knock.app) (concepts, in-app UI, integrations, API reference), [postmarkapp.com/pricing](https://postmarkapp.com/pricing), plus the local checkout for Cadence's grounding facts. Every claim below cites its source.

## TL;DR

Knock's free tier (now branded the **Free plan**, "formerly known as our Developer plan" per [Knock plans](https://docs.knock.app/manage-your-account/knock-plans)) is genuinely complete for what Cadence needs: a real-time in-app feed with official React components **and** headless hooks, batching/digests, scheduled workflows, and Postmark email — all inside 10,000 messages/month at $0 with no credit card, and no hard cap if you drift over. The two catches that should actually shape the decision: (1) **recipient and feed data moves out of Cadence's SQLite into Knock** (you identify users to Knock; feed items and their read/seen state live there), and (2) **web push is not a native channel** — it's only reachable through the FCM channel with a browser token from the FCM web SDK, which Cadence (no service worker today) doesn't have. The self-build baseline (SQLite feed table + unread counts + on-load polling) is cheap and keeps all data local, but it caps out at exactly the two things Cadence has no infra for: live updates (needs a realtime server) and digests (needs a scheduler).

## Grounding: what Cadence is today

Verified in the local checkout:

- React Router v8 (8.3.0) with SSR enabled (`react-router.config.ts`: `ssr: true`).
- SQLite via better-sqlite3 + Drizzle ORM (`package.json`, `app/db/schema.ts`). Users table: integer autoincrement PK, `name`, `email` (unique), `role`, `avatarUrl`.
- No background jobs/queues, no real-time primitives: no WebSocket/EventSource usage anywhere under `app/`.
- No PWA/service worker/web-push manifest: `public/` contains only `favicon.svg` and `images/`.
- The README's claim to verify: "Knock, a free Developer account, when you build notifications. Its keys go in `.env`, which is gitignored."

**Verdict on the README claim:** accurate but renamed. Knock's docs say the free tier is now the "Free plan (formerly known as our Developer plan)" ([Knock plans](https://docs.knock.app/manage-your-account/knock-plans)); the signup link on the pricing page still carries `ref=pricing-developer-plan` ([pricing](https://knock.app/pricing)). Keys-in-`.env` matches the docs' own convention (`KNOCK_API_KEY`, `KNOCK_PUBLIC_API_KEY`, `KNOCK_SIGNING_KEY` env vars; [security docs](https://docs.knock.app/in-app-ui/security-and-authentication)).

## What the Free plan includes (as of 2026-11-26)

From [knock.app/pricing](https://knock.app/pricing) (page dated 2026-11-10) and [Knock plans & usage](https://docs.knock.app/manage-your-account/knock-plans):

| Fact | Free plan |
| --- | --- |
| Price | $0/mo, no credit card ([pricing](https://knock.app/pricing)) |
| Messages sent | up to 10,000/month (a message = one delivery to one user on one channel; bounces/failures and preference-suppressed sends don't count; an in-app + email workflow run counts as 2) |
| Guide recipients | up to 500/month (in-app guides/banners product; feeds are separate and unmetered per-item) |
| Agent credits | up to 500/month |
| Workflows, broadcasts, channels, stored profiles, team members, environments | Unlimited |
| Batching (digests), scheduled workflows, conditional sending, preferences, non-user recipients | Included |
| In-app feeds | Unlimited feeds per recipient, pre-built components, bring-your-own components, Feed API, custom feed filtering, unlimited feed retention |
| Logs | Yes, 30-day retention |
| Overage behavior | **No hard cap** — "If you go over your limit, we'll get in touch with you about making sure you have a billing method in place next month" ([pricing FAQ](https://knock.app/pricing)) |
| Compliance | SOC 2 Type 2, GDPR certified, CCPA |

**Gated to Starter ($250/mo):** removing Knock branding from pre-built components, email client previews, priority support. **Gated to Enterprise:** translations (i18n), per-tenant branding/preferences/guides, batch render limits beyond 10 items, custom permission groups, SAML/SCIM, audit logs, warehouse/Datadog/Segment/Heap exports ([pricing](https://knock.app/pricing), [Knock plans](https://docs.knock.app/manage-your-account/knock-plans)).

**Testing without burning quota:** sandbox mode renders messages in the dashboard without delivering downstream and **doesn't count toward usage** — but the in-app channel doesn't support sandbox mode (no downstream provider), so use channel conditions to gate in-app steps in non-production environments ([Knock plans FAQ](https://docs.knock.app/manage-your-account/knock-plans)). Triggers also accept `settings.sandbox_mode` / `skip_delay` for test runs ([triggering via the API](https://docs.knock.app/send-notifications/triggering-workflows/api)).

## In-app feed: React support and React Router v8 SSR fit

### Official React packages

The current library is [`@knocklabs/react`](https://www.npmjs.com/package/@knocklabs/react) (with `@knocklabs/client` underneath); the older `@knocklabs/react-notification-feed` is deprecated with a published migration path ([React overview](https://docs.knock.app/in-app-ui/react/overview), [migration doc](https://docs.knock.app/in-app-ui/react/sdk/migrating-from-react-notification-feed)). No React Router–specific guide exists — quick starts cover plain React/Vite and Next.js — but nothing in the SDK is Next.js-specific.

### Embedded widget vs headless — both are first-class

**Pre-built components** ([Feed doc](https://docs.knock.app/in-app-ui/react/feed)): wrap your layout in `KnockProvider apiKey={KNOCK_PUBLIC_API_KEY} user={{ id }}` → `KnockFeedProvider feedId={KNOCK_FEED_CHANNEL_ID}` → render `NotificationIconButton` (bell with badge) + `NotificationFeedPopover` (popover) or `NotificationFeed` (full page). Styling via the imported CSS, `--rnf-*` CSS variables, `rnf-*` classes, or per-cell `renderItem` overrides; `colorMode="dark"` supported; seen-marking is automatic on open. What you give up on Free: "Remove Knock branding" is a Starter feature ([pricing](https://knock.app/pricing)) — the widget carries Knock branding unless you go headless or pay.

**Headless** ([headless feed doc](https://docs.knock.app/in-app-ui/react/headless/feed)): `useKnockClient` → `useNotifications(client, feedId)` → `useNotificationStore(feedClient)` gives you `items`, `metadata` (`unread_count`, `unseen_count`), and a `feedClient` with `fetch()`, `markAllAsSeen()`, `markAsSeen(item)`, `markAsRead(...)`. `compact` mode (default) trims the payload; `rich` returns everything. The docs' warning worth keeping: with headless UI **you** must mark items as seen — "If you don't mark items as seen, `unseen_count` never decreases and any badge based on it never clears."

**Feed API itself** ([in-app API overview](https://docs.knock.app/in-app-ui/api-overview)): reverse-chronological paginated items with rendered `blocks` (markdown/text/button-set), `data` passthrough from the trigger payload, `read_at`/`seen_at`/`link_clicked_at`/`archived_at` engagement fields, and `FeedMetadata` with `total_count`/`unread_count`/`unseen_count`. Filters by tenant, source workflow, status, and trigger data. So even the "headless" path is backed by a documented public API, not private internals.

### Live updates

Managed **WebSocket** to `*.knock.app`, "no infrastructure setup required" ([in-app overview](https://docs.knock.app/in-app-ui/overview)). The socket emits `new-message` events carrying updated badge-count metadata (may be throttled) ([real-time service](https://docs.knock.app/in-app-ui/api-overview)). Options: `auto_manage_socket_connection` (disconnect inactive tabs, reconnect on focus), and experimental `__experimentalCrossBrowserUpdates` (BroadcastChannel tab sync) ([socket behavior](https://docs.knock.app/in-app-ui/feeds/socket-behavior)). One deployment detail: CSP must allow `wss://*.knock.app` ([security docs](https://docs.knock.app/in-app-ui/security-and-authentication)).

### Unread counts / badges

Two counts, tracked separately: `unseen_count` (drives the default badge; decremented when the feed opens) and `unread_count` (explicit engagement) ([headless feed doc](https://docs.knock.app/in-app-ui/react/headless/feed)). `NotificationIconButton` defaults its badge to unseen and can switch with `badgeCountType="unread"` ([Feed doc](https://docs.knock.app/in-app-ui/react/feed)).

### SSR fit for React Router v8

The Knock React components are a **client-side island**: the quick start states the provider/components "use client-side React APIs" and must be client components ([React quick start](https://docs.knock.app/getting-started/quick-start/react)); the feed data is fetched and the socket is opened from the browser against the public API key. In an SSR React Router app that means: SSR renders the layout shell, the provider mounts on hydration, and the feed populates client-side. The server side of the integration is entirely the Node SDK (triggers, identification, token signing) — see below. This is the same shape as any client-only island (Monaco, the DevUI) Cadence already hosts, so SSR is not an obstacle. Authentication of the feed: by default a **public API key alone can act as any user** ("Knock will not reject requests that do not include a signed user token") — fine for a course project, but production requires **enhanced security mode**: the backend signs an RS256 JWT (`sub` = user id) with a signing key from the dashboard and the client passes it as `userToken` to `KnockProvider` ([security docs](https://docs.knock.app/in-app-ui/security-and-authentication)). Knock's own docs are blunt: "Enable enhanced security mode before you go live."

## Channels

### Email via Postmark

Knock has a first-class Postmark integration: configure per environment with your **Postmark server API key** and a from address; delivery/bounce/spam webhooks flow back into Knock's message timeline; the recipient needs an `email` property; payload overrides (e.g. targeting a Postmark `MessageStream`) are supported ([Postmark integration](https://docs.knock.app/integrations/email/postmark)). Two things the pricing FAQ makes explicit: you still run (and pay for) your own Postmark account — "We do not manage billing for the downstream platform providers" — and Postmark's own free Developer plan is **100 emails/month, never expires, no credit card** ([Postmark pricing](https://postmarkapp.com/pricing)). For a course project there's an even lower-friction start: Knock ships a **built-in test email channel**, enabled by default on new accounts — also 100 emails/month, but it only delivers to your Knock account members' addresses ([Knock test emails](https://docs.knock.app/integrations/email/knock-test)). So: zero extra signups to demo email (test channel), one extra signup (Postmark) for real sends.

### Push: APNs / FCM / web push

- **APNs**: channel needs an Apple developer account's token signing key (or cert) + key/team IDs + bundle ID; device tokens are stored on the user as channel data ([APNs integration](https://docs.knock.app/integrations/push/apns)). Irrelevant to a web-only course project.
- **FCM**: channel needs a Firebase **Project ID + full Service Account JSON**; tokens (Android, iOS, *or web*) are set as user channel data; `webpush` overrides supported ([FCM integration](https://docs.knock.app/integrations/push/firebase)).
- **Web Push: no native VAPID channel.** The supported-providers list is APNs, FCM, Expo, Amazon SNS, OneSignal ([push overview](https://docs.knock.app/integrations/push/overview)). Web push *is* possible, but only by riding the FCM channel: "Retrieve a browser token with the FCM web SDK, send it to your server, and set it as the user's FCM channel data in Knock" ([push FAQ](https://knock.app/channels/push)). That means a Firebase project, the FCM web SDK, and a service worker in the browser — Cadence has **no service worker/manifest today**, so web push has real setup cost regardless of Knock.

### Digests / scheduled batching — both included on Free

- **Batch function** (in-workflow digests): opens a per-recipient batch window (fixed duration, dynamic from a variable, window rules like "weekly Monday 9am", or sliding), aggregates subsequent triggers as `activities`, exposes `total_activities`/`total_actors`/`activities` to templates; batch keys group per subject; "immediately flush leading item" mode exists; max window 90 days. Templates can render at most **10 activities/actors — the raise-to-100 setting is Enterprise** ([batch function](https://docs.knock.app/designing-workflows/batch-function)). Knock itself notes batch isn't ideal for standing daily/weekly digests and points at…
- **Schedules** (recurring workflows): a "managed, recipient-timezone-aware cron job" — recurring (`repeats`: daily/weekly/monthly/hourly, per-recipient `timezone` honored) or one-off (`scheduled_at`), created via the API/SDK for up to 100 recipients per call, with optional static `data` or an HTTP fetch step to pull dynamic content ([Schedules](https://docs.knock.app/concepts/schedules)). "Scheduled workflows" is a Yes on the Free plan ([pricing](https://knock.app/pricing)).

This matters for Cadence specifically: **Cadence has no queue, worker, or cron to lean on** — a self-built digest has nowhere to run, while Knock's free tier runs the cron for you.

## Workflows, templates, and where recipient data lives

### How a notification is modeled

A **workflow** is designed in the Knock dashboard (trigger → function steps like delay/batch/branch/throttle/fetch → channel steps), versioned with commits, and testable in a test runner ([React quick start](https://docs.knock.app/getting-started/quick-start/react), [batch function](https://docs.knock.app/designing-workflows/batch-function)). Your code triggers it:

```js
import Knock from "@knocklabs/node";
const knock = new Knock({ apiKey: process.env.KNOCK_API_KEY });
await knock.workflows.trigger("refund-decision", {
  recipients: [student.id],        // or inline: [{ id, email, name }]
  actor: admin.id,                 // optional; attributed in feed items
  data: { courseTitle, decisionNote, actionUrl },
});
```

The trigger call takes `recipients` (id strings, object refs, or **inline full recipients upserted before the run** — so no separate identify call is required), `actor`, `data` (10 MB cap), `tenant`, `cancellation_key`, and an `Idempotency-Key` for safe retries; up to 1,000 recipients per call ([triggering via the API](https://docs.knock.app/send-notifications/triggering-workflows/api), [trigger endpoint](https://docs.knock.app/api-reference/workflows/trigger)). Message content is Liquid-templated per channel step in the dashboard ([template editor](https://docs.knock.app/template-editor/overview)) — content lives in Knock, not in the codebase.

### Where recipient data lives

**In Knock, not in your database.** "User data must be synchronized to Knock… all users who are sent a notification are identified in your Knock environment and are persisted" — Knock frames itself as "a cache of information about users," with `id` (immutable, ≤256 chars, no `/` or `#` — Cadence's integer PKs stringify fine), `email`, `name`, `avatar`, `timezone`, plus arbitrary custom properties (≤256 kB) ([Users](https://docs.knock.app/concepts/users)). Identification is an upsert via three routes: direct (`knock.users.identify`), **inline in the trigger call** (recommended lazy path), or bulk ([identifying recipients](https://docs.knock.app/managing-recipients/identifying-recipients)). Users are **unique per environment**; deletion and merge APIs exist; Knock is GDPR certified and stores profile data in its (US) environment — EU data residency is only "coming soon" ([Knock plans](https://docs.knock.app/manage-your-account/knock-plans)). Feed items, read/seen state, and badges likewise live in Knock, with unlimited feed retention on Free. Concretely for Cadence: SQLite stays the system of record, but a second copy of user identity + all notification state lives behind Knock's API.

### Server-side SDK in a Node SSR app

`@knocklabs/node` is the server SDK among official Node/Python/Ruby/Go/PHP/Java/C#/Elixir libraries ([client libraries](https://docs.knock.app/api-reference/overview/client-libraries)). In a React Router v8 SSR app this is exactly a **loader/action concern**: instantiate `new Knock({ apiKey: process.env.KNOCK_API_KEY })` server-side, call `workflows.trigger` from the action that performs the domain event (e.g. approving a refund), and optionally `users.identify` on signup/profile change. For enhanced security mode the same package signs client tokens: `signUserToken(userId, { signingKey: process.env.KNOCK_SIGNING_KEY })` from `@knocklabs/node/lib/tokenSigner`, handed to `KnockProvider userToken` ([security docs](https://docs.knock.app/in-app-ui/security-and-authentication)) — in SSR that's done in a loader/middleware and serialized to the client, mirroring how the docs do it in an Express middleware.

### Rate limits and quotas

Rate limits are per-endpoint **tiers**, scoped per environment (per environment + user when using signed tokens): the tiers run 1 / 5 / 60 / 200 / **1,000 requests per second** ([rate limits](https://docs.knock.app/api-reference/overview/rate-limits) — note: the tier labels column of that table doesn't render, but the endpoint pages confirm the numbering: workflow trigger is **tier 5** ([trigger endpoint](https://docs.knock.app/api-reference/workflows/trigger)), user identify is **tier 3** ([identify endpoint](https://docs.knock.app/api-reference/users/update)), feed listing is **tier 2 and always scoped per user** ([feed endpoint](https://docs.knock.app/api-reference/users/feeds/list_items))). Nothing documents lower rate limits for the Free plan — the binding free-tier constraint is the **10,000 messages/month** metering plus the 500/mo guides cap, not request throughput. Overage is a soft cap (they contact you), and workflow triggers themselves are unmetered and unlimited on all plans ([pricing](https://knock.app/pricing)).

## Self-build baseline (the comparison)

What Cadence would build to match the *core* in-app feed, given SQLite + Drizzle, no jobs, no realtime:

1. **Schema** (one migration): a `notifications` table — `id`, `recipientUserId` FK, `type`/workflow key, `data` JSON (course title, decision note, action URL), `actorUserId`, `actionUrl`, `readAt`, `seenAt`, `archivedAt`, `createdAt`, indexed on `(recipientUserId, createdAt)`. Unread badge = `COUNT(*) WHERE recipientUserId = ? AND readAt IS NULL` — a cheap query at course scale, no counter table needed.
2. **Write path**: insert one row per recipient **inside the same SQLite transaction** as the domain action (refund approved, comment replied). This is the part that's genuinely easy self-built — no queue required, atomic with the domain write, and something Knock's HTTP call can't give you for free (a failed trigger call needs retry logic on your side).
3. **Read path**: a `/notifications` route + bell component; on-load/on-navigation refetch of the feed and badge count. Live updates = polling, because the app has no WebSocket/SSE server and adding one means new infra.
4. **What doesn't exist locally and would have to be built**: digests/scheduled sends (needs a scheduler — nothing in the app can run "every Monday 9am"; you'd bolt on `setInterval`, a cron-hit endpoint, or a scheduled GitHub Action); email (Postmark SDK + templates + bounce handling, straight into the app); push (provider credentials + token storage/rotation); retry/delivery logs; per-user preferences.

**Sizing the comparison honestly:**

| Capability | Knock free | Self-build in Cadence |
| --- | --- | --- |
| Feed list + badges | `NotificationFeed` widget or ~50 lines of hooks; realtime socket included | 1 table, 2 queries, 1 route, 1 component; badge is one COUNT query |
| Live updates | Managed WebSocket, free, zero infra | On-load polling only; realtime means building a WS/SSE server |
| Seen/read tracking | Built into API + components | Two timestamp columns + write handlers — easy |
| Digests/batching | Batch step or timezone-aware schedules, included on Free | No scheduler exists — this is the biggest self-build gap |
| Email | Postmark channel config; or zero-signup test channel (100/mo) | Postmark SDK integration in-app; Postmark free tier is 100/mo either way |
| Push | APNs/FCM channels; web push via FCM only | Same provider work, plus your own token store |
| Data locality | User + notification state lives in Knock | Everything stays in SQLite |
| Branding | Knock branding on prebuilt components (removal is $250/mo Starter) — go headless to avoid | Fully yours |
| Signup friction | 1 account (Knock), +1 if real email (Postmark) | 0 new accounts, +1 if email (Postmark) |
| Cost | $0 (10k msgs/mo, soft cap) | $0 |

## What the free tier does **not** give you

- No branding removal on pre-built components (Starter, $250/mo) — the headless hooks route around this but you write the UI.
- No email client previews (Starter), no translations/i18n, no per-tenant branding/preferences/guides, batch render limit capped at 10, no audit logs/SAML/SCIM, no Datadog/Segment/warehouse exports (Enterprise) ([pricing](https://knock.app/pricing), [Knock plans](https://docs.knock.app/manage-your-account/knock-plans)).
- No native Web Push channel — browser push only via FCM web tokens + a service worker you must add ([push FAQ](https://knock.app/channels/push), [FCM](https://docs.knock.app/integrations/push/firebase)).
- Not a plan limit but a real constraint: until enhanced security mode is enabled, the public key can act as any user; going "live" means adding RS256 token signing to the server flow ([security docs](https://docs.knock.app/in-app-ui/security-and-authentication)).
- Guides (banners/paywalls — separate from feeds) meter 500 recipients/month on Free, then it's a paid conversation ([pricing](https://knock.app/pricing)).

## The one or two facts that should most shape the Infra & channels decision (#5)

1. **The free tier covers the whole feature list — so the decision is architectural, not financial.** Real-time feed, unread badges, digests, scheduled sends, and Postmark email all fit inside Free at $0 with no hard cap. The real price is data topology: recipients get mirrored into Knock (upsert on identify/trigger), notification content and read/seen state live in Knock's dashboard rather than the codebase and SQLite, and any real release adds signed user tokens to the auth flow. If that trade is acceptable, there is no cost argument for self-building.
2. **Knock's free tier is exactly the infra Cadence doesn't have.** Live updates (managed WebSocket) and scheduled digests (recipient-timezone-aware cron) are the two things a SQLite-plus-nothing stack cannot deliver without new server components; self-build's honest ceiling is on-load polling and hand-rolled scheduling. Conversely, if "web push someday" is on the map, remember it's FCM-only through Knock and requires a service worker Cadence doesn't have — that's additive work on either path.

## Sources

- Knock pricing (Free/Starter/Enterprise, metering, FAQ): https://knock.app/pricing
- Knock plans & usage (formerly-Developer note, enterprise features, sandbox mode, environments): https://docs.knock.app/manage-your-account/knock-plans
- Rate limits (tiers, scoping): https://docs.knock.app/api-reference/overview/rate-limits
- Trigger workflow endpoint (tier 5, payload): https://docs.knock.app/api-reference/workflows/trigger · Identify user (tier 3): https://docs.knock.app/api-reference/users/update · List feed items (tier 2, per-user): https://docs.knock.app/api-reference/users/feeds/list_items
- In-app UI overview (realtime websocket, badge counts, drop-in components): https://docs.knock.app/in-app-ui/overview
- In-app API & real-time service (`new-message`, FeedMetadata, FeedItem): https://docs.knock.app/in-app-ui/api-overview
- React overview (`@knocklabs/react`, deprecated package): https://docs.knock.app/in-app-ui/react/overview
- Pre-built Feed component (providers, widget, badgeCountType, socket options): https://docs.knock.app/in-app-ui/react/feed
- Headless feed hooks (useNotifications, seen/read marking): https://docs.knock.app/in-app-ui/react/headless/feed
- Security & authentication (public key model, enhanced security, signUserToken, CSP): https://docs.knock.app/in-app-ui/security-and-authentication
- React quick start (client component, workflow publish, Node SDK trigger): https://docs.knock.app/getting-started/quick-start/react
- Users concept (identification, properties, persistence, per-environment): https://docs.knock.app/concepts/users
- Identifying recipients (direct/inline/bulk, reserved properties): https://docs.knock.app/managing-recipients/identifying-recipients
- Triggering workflows via the API (recipients, actor, data limits, idempotency): https://docs.knock.app/send-notifications/triggering-workflows/api
- Client libraries (Node SDK et al.): https://docs.knock.app/api-reference/overview/client-libraries
- Batch function (digests, windows, render limit enterprise gating): https://docs.knock.app/designing-workflows/batch-function
- Schedules (recurring/one-off, recipient timezones): https://docs.knock.app/concepts/schedules
- Push overview (supported providers): https://docs.knock.app/integrations/push/overview · APNs: https://docs.knock.app/integrations/push/apns · FCM (incl. web push): https://docs.knock.app/integrations/push/firebase · Push channel FAQ (web push via FCM): https://knock.app/channels/push
- Postmark integration: https://docs.knock.app/integrations/email/postmark · Knock built-in test email: https://docs.knock.app/integrations/email/knock-test
- Postmark pricing (free Developer plan, 100 emails/mo): https://postmarkapp.com/pricing
