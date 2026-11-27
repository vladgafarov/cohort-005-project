# Notification workflows in Knock — the dashboard runbook

Cadence's notification system triggers one Knock **workflow** per catalog
**Event** (spec issue #13; ADR 0013). Workflow *definitions* — the canvas, the
channel steps, the Liquid templates — can only be created in the Knock
dashboard: the published API has exactly two `/v1/workflows/...` endpoints,
`trigger` and `cancel`, and no create/read/update/delete for definitions
(verified live — `GET /v1/workflows` and `GET /v1/workflows/{key}` both
return 404). Everything the app does in code is written already; this
runbook is the human half of the work, and `docs/agents` machines can't do
it for you.

The app half, for reference:

- Route actions dispatch through one wrapper — `app/lib/knock.server.ts`
  (`triggerWorkflow`) — with payloads built by pure, db-first builders in
  `app/lib/notifications.server.ts`.
- The feed is a client island over the SSR shell —
  `app/components/notifications/` — rendering custom rows through the pure
  formatter in `app/lib/notification-rows.ts`. No prebuilt Knock components
  are used (they carry unremovable Free-plan branding).
- All notification state (feed items, read state, preferences) lives in
  Knock. Nothing is stored locally.

## The key convention

Workflow keys are **kebab-case, past-tense Event names, immutable once
chosen**. A key is a durable identifier in three places at once: the trigger
call, the per-workflow preference key on a user's `default` preference set,
and the `source.key` stamped on every feed item (the row formatter's switch
key). Renaming one later orphans existing preferences and silently breaks
existing rows' deep links — the deep-link tests in
`app/lib/notification-rows.test.ts` exist to catch exactly that, and they
assert the key **by name**, so a rename fails a test, not a row.

## Build one workflow (the setup loop)

Mirror the provisioned sample workflow `cadence-sample` (in `.env` as
`KNOCK_SAMPLE_WORKFLOW_KEY`; a reference, not one of the nine):

1. Dashboard → **Workflows** → create a workflow with the key from the table
   below. Give it the Event's name as the display name.
2. Add one **in-app feed** channel step. Select the channel whose id is
   `KNOCK_FEED_CHANNEL_ID` in `.env` (a UUID; Channels under account
   settings).
3. Template the step's body block with Liquid. The trigger `data` is
   available under `data.*`, the actor under `actor.*`, the recipient under
   `recipient.*` — e.g. `{{ actor.name | default: "Someone" }} requested a
   refund on {{ data.courseTitle }}`. Keep it one line; the in-app row
   renders its own text from the data, and the body is the delivery record.
4. Do not attach categories (per-Event preferences only, never category
   keys) and do not enable the "override recipient preferences" escape
   hatch.
5. **Commit** the workflow version (definitions are versioned; every run
   stamps a `version_id`). The builder in the dashboard can test-run it
   before you commit.

The trigger payload is flat — scalar strings and numbers only — because the
feed's compact mode strips nested arrays and objects from item data. The
builders guarantee this in code (pinned by a test); keep any manual test
payloads flat too.

## The nine Event keys and their one-line bodies

Create **`refund-request-raised` first** — it is the tracer bullet
(issue #15): everything on the app side is wired to it, and the DevUI loop
below verifies it end to end. The other eight arrive with their tickets
(#16–#24); their keys and bodies are listed here so this runbook is the
complete catalog.

| # | Workflow key | Notifies | One-line Liquid body |
| --- | --- | --- | --- |
| 1 | `refund-request-raised` | every Platform Admin | `**{{ actor.name \| default: "Someone" }}** requested a refund on **{{ data.courseTitle }}** — “{{ data.reason }}”.` |
| 2 | `refund-request-decided` | the buyer | `**{{ actor.name \| default: "The Cadence team" }}** {{ data.decision }} your refund request on **{{ data.courseTitle }}**.` |
| 3 | `lesson-comment-posted` | the course's Instructor | `**{{ actor.name \| default: "Someone" }}** commented on your lesson **{{ data.lessonTitle }}**.` |
| 4 | `comment-reply-posted` | the parent-comment author | `**{{ actor.name \| default: "Someone" }}** replied to your comment on **{{ data.lessonTitle }}**.` |
| 5 | `course-rating-left` | the course's Instructor | `**{{ actor.name \| default: "Someone" }}** rated **{{ data.courseTitle }}** {{ data.rating }}★.` |
| 6 | `seat-claimed` | the Team Admin who bought the Team Licence | `**{{ actor.name \| default: "Someone" }}** claimed a Seat on **{{ data.courseTitle }}**.` |
| 7 | `course-status-changed` | the Instructor | `**{{ actor.name \| default: "Someone" }}** {{ data.status }} your course **{{ data.courseTitle }}**.` |
| 8 | `new-lesson-available` | every enrolled Student | `A new lesson **{{ data.lessonTitle }}** is available in **{{ data.courseTitle }}**.` |
| 9 | `user-role-changed` | the user | `**{{ actor.name \| default: "The Cadence team" }}** changed your role to {{ data.role }}.` |

Event #2 is one workflow whose trigger data carries
`decision: "approved" | "declined"`; event #7 likewise carries
`status: "published" | "archived"` and its dispatch site never fires for
Draft. One workflow per catalog Event — one preference toggle each.

## The DevUI loop (the integration test, by hand)

After creating `refund-request-raised` in the dashboard, verify the tracer
bullet — this loop, not a fixture panel, is what catches a forgotten
dispatch line:

1. Run `npm run dev` and `npm run db:seed` if the database is empty.
2. In the DevUI panel, switch to a buyer with a refundable purchase — e.g.
   **Emma Wilson** (id 5).
3. Open her course page → **Request a refund** → submit a reason. The buyer
   still gets the refund email; the app now also dispatches the
   notification (a failed trigger is logged and swallowed — the refund
   itself always succeeds).
4. Switch the DevUI panel to the Platform Admin — **Alex Rivera**
   (id 1). The switch is a full-document POST, so the notification provider
   remounts and re-establishes the realtime socket for the new user.
5. Watch the **Notifications** sidebar item: its badge counts the Unread
   row, live, with no refresh. (The feed write lands a beat — about a
   second — after the trigger returns; if you raced it, give it a moment.)
6. Click **Notifications**: the row shows Emma's avatar with a refund icon
   chip, "Emma Wilson requested a refund", the course title, and a relative
   time. Opening the feed has marked it seen provider-side, but the badge
   still counts it Unread until it is read.
7. Click the row: it deep-links to the Platform Admin's refund queue
   (`/admin/refunds`) and the row is now **Read** — the second of the feed's
   exactly two states. The badge count clears with it.

The dashboard's message logs (30-day retention on the Free plan) are the
sole delivery record; the trigger response only returns a `workflow_run_id`.

## The history loop (issue #16)

The feed's history behaviors — grouping, the filter, and clearing the
backlog — are verified the same way, by hand in the DevUI:

1. With several rows in the feed, open **Notifications**: rows are
   grouped **Today / Earlier** — the day's rows on top, the rest in
   feed order below.
2. Filter to **Unread**: only rows not yet read remain. Switch back to
   **All** and everything is still there — Read rows stay in the feed,
   a history, not a queue.
3. On an Unread row, press the **check mark** beside it: the row turns
   Read without navigating, the sidebar badge drops by one, and the row
   is still in the feed under All.
4. Press **Mark all read**: the backlog clears in one action and the
   badge falls to zero. Under All, every row remains, marked Read.

The grouping and the filter behind this loop are pure functions in
`app/lib/notification-history.ts`, pinned by their colocated tests; the
badge counts the same `unread_count` the provider tracks, so it clears
only as rows are actually read — opening the feed marks rows seen and
does not touch the badge.

## Pinned requirements

- **Content security policy (none exists today — do not add one).** When
  the app gains a CSP, Knock's realtime socket requires
  `wss://*.knock.app` in `connect-src` (the socket lives at
  `wss://api.knock.app/ws/v1` and may move across `knock.app` subdomains):
  `connect-src 'self' https://*.knock.app wss://*.knock.app`.
- **Go-live (stated, not v1):** until Knock's enhanced security mode is
  enabled, the publishable key can act as any user. Going live means
  enabling it in the dashboard and passing backend-signed user tokens
  (`signUserToken` from `@knocklabs/node`, `KNOCK_SIGNING_KEY`) to the
  client provider.
