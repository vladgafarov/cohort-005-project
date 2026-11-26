# Research: Mobile push feasibility for a web-only app

Resolves the question from #3 ("Mobile notifications maybe"), and feeds the Infra & channels decision in #5. Grounding: Cadence today is a React Router v8 SSR app (SSR on, Vite 7) with zero PWA pieces — `public/` holds only a favicon and two course images, and a search of `app/` finds no `serviceWorker`, `pushManager`, `Notification`, or manifest code. The README already suggests [Knock](https://knock.app/) (free Developer account) as the notification provider.

## TL;DR

Mobile push is **feasible and free, but not "just add a library"**. The standards-based Web Push path (Push API + Notifications API + VAPID) needs no Apple or Google developer account, and works on Android/desktop Chrome today for any HTTPS site with no install step — roughly half a day of work for Cadence (~5 small files). The unavoidable cost is the **PWA groundwork**: a service worker, a web manifest + icons, a permission prompt, and a subscribe→store flow. **iOS is the expensive part, and it's a product cost, not a code cost**: since iOS 16.4 (March 2023) web push exists, but only for sites the user has manually added to their Home Screen — there is no install prompt API, so most visitors will never get that far. A provider does not rescue this: **Knock has no first-party web push channel** — its own tutorial builds the same service-worker/permission/subscription groundwork on top of a second signup (Firebase), and its sample code explicitly throws on iOS unless the app is installed to the Home Screen. Recommendation: if push is wanted at all, do the minimal standards path with the `web-push` library (no extra accounts); treat iOS as a demo on your own device; let Knock power in-app/email channels, and only wire push through it if Knock workflows are already the send path.

## Mechanics: the minimum viable Web Push setup

Web Push is the union of three standards working together: the Push API, the Notifications API, and Service Workers ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). The pieces, end to end ([web.dev overview](https://web.dev/articles/push-notifications-overview)):

1. **A service worker.** An app can only receive push if it has an active service worker, which subscribes via `PushManager.subscribe()` and receives messages as `push` events, displaying them with `showNotification()` ([MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)). Service workers require a secure context — HTTPS in production, though `http://localhost` counts as secure for development ([MDN Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)).
2. **Permission, from a user gesture.** `Notification.requestPermission()` should be triggered by an explicit user action (a button), never on page load — a blocked permission is effectively permanent until the user digs through browser settings ([web.dev Permission UX](https://web.dev/articles/push-notifications-permissions-ux)). On iOS, WebKit requires the request to be "in response to direct user interaction" ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
3. **VAPID keys.** A one-off public/private keypair ("application server keys"). The public key is passed to `subscribe()` as the `applicationServerKey`; the private key signs each send so the push service knows the request came from you ([web.dev overview](https://web.dev/articles/push-notifications-overview)).
4. **A subscription to store.** The browser returns a `PushSubscription` — an endpoint URL plus encryption keys — which you POST to your server and store in a database. The endpoint is a capability URL: knowledge of it is all that's needed to send to that device, so treat it as a secret ([MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)).
5. **Sending.** Your server POSTs each message to the endpoint, held by a browser-vendor push service (Chrome uses FCM, Apple uses APNs web push). You don't talk to Google or Apple directly — the standardized web push protocol request works for every push service ([web.dev overview](https://web.dev/articles/push-notifications-overview)). The [`web-push` Node library](https://web.dev/articles/sending-messages-with-web-push-libraries) handles VAPID signing and payload encryption (`webpush.setVapidDetails` + `sendNotification(subscription, payload)`); a `404`/`410` response means the subscription expired — delete it from the DB.
6. **Notifications are mandatory.** Browsers currently don't allow silent push: every push must display a user-facing notification ([web.dev overview](https://web.dev/articles/push-notifications-overview)).
7. **A web manifest + icons** — not strictly part of the push protocol on Android/desktop, but required for the iOS install path (below) and good hygiene for any installable web app ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).

Everything above is self-hosted and free: VAPID keys are self-generated, and the standards path on Chrome requires **no** Google or Firebase project at all ([web.dev FAQ](https://web.dev/articles/push-notifications-faq)).

## iOS: the install gate

- **Since iOS/iPadOS 16.4 (March 2023)**, Web Push works — but only for **Home Screen web apps**, not for sites visited in a Safari tab. The user must first use Safari's Share menu → "Add to Home Screen" ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
- Once added, the web app can request permission **in response to direct user interaction**, and its notifications then behave exactly like native apps': Lock Screen, Notification Center, paired Apple Watch, Focus modes, per-app notification settings, plus the Badging API ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
- **No Apple Developer Program membership is needed** — it's the same standards-based Web Push as macOS Safari (since Safari 16.1); the server just needs to reach `*.push.apple.com` ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
- Pre-iOS 26, becoming a "web app" (rather than a Home Screen bookmark, which gets no push) required a manifest with `display: standalone`/`fullscreen` (or the legacy apple meta tag). **Since iOS 26 (Safari 26.0, Sept 2025), every site added to the Home Screen opens as a web app by default** — "zero requirements for installability" — though a manifest is still what defines your icons and name ([WebKit Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)). WebKit has not changed the Home Screen requirement itself: in 2026, iOS push still means installed web apps, not browser tabs.
- **The product cost:** iOS has no `beforeinstallprompt`-style API; users must find "Add to Home Screen" themselves. For a course project that means realistic iOS adoption is ~you and whoever you hand the phone to. Budget it as a demo, not a feature.

### Android/Chrome contrast

- On Android (and desktop Chrome/Edge/Firefox), push works for **any HTTPS website from the browser — no install required** ([web.dev overview](https://web.dev/articles/push-notifications-overview), [FAQ](https://web.dev/articles/push-notifications-faq)).
- The Android OS wakes the browser on an incoming push even when the browser is "closed", which then wakes your service worker ([web.dev FAQ](https://web.dev/articles/push-notifications-faq)).
- With VAPID, no Google/Firebase project or sender ID is needed — Chrome "just works" ([web.dev FAQ](https://web.dev/articles/push-notifications-faq)), and Chrome imposes no push-message quota ([MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)).

## Effort for Cadence (React Router v8 SSR)

Nothing about SSR changes the shape of the work — the only SSR-specific care is registering the service worker **client-side only** (in a `useEffect`), since `navigator.serviceWorker` doesn't exist during server rendering. Knock's own React/SSR tutorial uses exactly this pattern ([Knock FCM tutorial](https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm)). Concrete checklist:

| Change | What |
| --- | --- |
| `public/manifest.webmanifest` (+ 192/512 icons, `apple-touch-icon`) | name, `display: standalone`, icons; icons via manifest are supported since iOS 15.4 ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)) |
| `public/sw.js` (~30 lines) | `push` handler → `showNotification()`; `notificationclick` → focus/open ([MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)) |
| `app/root.tsx` | `<link rel="manifest">` + `apple-touch-icon` in `<head>`; `useEffect` registering `/sw.js` (client-only) |
| Subscribe UI (~50-80 lines) | a "Notify me" button/toggle: custom pre-prompt, then `Notification.requestPermission()`, then `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, then POST the subscription ([web.dev overview](https://web.dev/articles/push-notifications-overview), [Permission UX](https://web.dev/articles/push-notifications-permissions-ux)) |
| Server (~50-80 lines) | one route/action to store subscriptions (Drizzle table keyed by user); a send path using [`web-push`](https://web.dev/articles/sending-messages-with-web-push-libraries) with VAPID keys in `.env` (already gitignored); delete subscriptions on 404/410 |

Roughly 150–250 lines across ~5 files. **~half a day** to working push on Android/desktop, including testing (dev on `http://localhost` is fine — it's a secure context; production needs HTTPS, which any real deploy provides). **~a day** total if you include iOS: testing requires a public HTTPS URL (deploy or tunnel) plus a physical iOS 16.4+ device, Add to Home Screen, then subscribe from the installed web app.

## Does Knock change the effort?

No — the groundwork is unavoidable regardless of provider, and for web push Knock actually **adds** a signup:

- **Knock does not have a first-party web push channel** — that's Knock's own wording. Web push goes through an FCM channel: you register a Firebase project, install the Firebase SDK, create a `firebase-messaging-sw.js` service worker in `public/`, register it from a client-only React provider, request permission, call `getToken(..., { vapidKey })`, and store the token as Knock channel data ([Knock FCM tutorial](https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm)). That is the same client groundwork as the standards path, plus Firebase config.
- Knock's own sample subscribe button includes the iOS gate: it throws unless the app is already installed — "In iPhone you must install the app first, by clicking on the Share button… 'Add to Home Screen'" ([Knock FCM tutorial](https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm)).
- What Knock **does** remove is the server-side send loop and token lifecycle: you send one workflow trigger, and Knock stores tokens as channel data, handles bounces (optional token deregistration), templates, and user preferences ([Knock push overview](https://docs.knock.app/integrations/push/overview)). Its first-class push channels are for **native** apps via APNs/FCM/Expo/OneSignal/SNS — Cadence has no native app, so those don't apply.
- For a web-only course project, the piece Knock replaces is the cheapest piece: with the `web-push` library, the whole server loop is ~20 lines (`sendNotification` per stored subscription, delete on 410) ([web.dev libraries](https://web.dev/articles/sending-messages-with-web-push-libraries)). Meanwhile the Firebase detour costs a second signup and SDK — the opposite of the course's "free tiers only, minimal signup friction" constraint.

So: adopt Knock for the notification UX layer (in-app feed, email, preferences) if the #5 decision goes that way — but don't adopt it *for* web push. If web push happens, the standards path is strictly cheaper, and the manifest/service-worker/permission groundwork has to be built either way.

## Cost & recommendation

- **Money:** zero everywhere. VAPID keys are self-generated; no Apple Developer Program ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)); no Google project needed on the standards path ([web.dev FAQ](https://web.dev/articles/push-notifications-faq)); Knock's Developer account is the README's suggested free tier. The recurring cost is maintenance: prune dead subscriptions (404/410) and keep the permission UX honest (always offer a way out — [web.dev Permission UX](https://web.dev/articles/push-notifications-permissions-ux)).
- **Time:** ~half a day for Android/desktop push; ~a day including iOS device testing.
- **The real cost is iOS adoption, not code.** "Add to Home Screen" is a manual, unpromptable funnel step; plan for it to be a developer demo, not a user feature.
- **Recommendation:** keep mobile push out of the critical path for #5. If push is genuinely wanted: (1) build the minimal standards path (`manifest + sw.js + subscribe button + one Drizzle table + web-push sender`) — no new accounts, free forever; (2) treat iOS as a working demo on your own phone; (3) if Knock is already powering in-app/email, adding push later means doing the same groundwork plus an FCM channel in Knock — additive, not blocked on today's decision.

## Sources

- [MDN — Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) (active service worker, `PushManager.subscribe`, `PushSubscription` endpoint secrecy, Chrome has no quota)
- [MDN — Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) (secure context requirement; `localhost` counts)
- [web.dev — Push notifications overview](https://web.dev/articles/push-notifications-overview) (the 3-step flow, push services, VAPID, no silent push)
- [web.dev — Sending messages with web push libraries](https://web.dev/articles/sending-messages-with-web-push-libraries) (`web-push` Node usage, 404/410 = expired subscription)
- [web.dev — Permission UX](https://web.dev/articles/push-notifications-permissions-ux) (double-permission pattern, never prompt on load)
- [web.dev — Push notifications FAQ](https://web.dev/articles/push-notifications-faq) (Android wakes browser on push; Chrome+VAPID needs no Google/Firebase project; FCM SDK is an optional abstraction)
- [WebKit — Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) (iOS 16.4, Home Screen web apps only, user-gesture permission, APNs, no dev program, manifest/web-app distinction)
- [WebKit — Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) (iOS 26: every Home Screen site opens as a web app by default)
- [Knock docs — Push notifications with Knock](https://docs.knock.app/integrations/push/overview) (native push channels: APNs/FCM/Expo/OneSignal/SNS; token deregistration)
- [Knock docs — Sending web push notifications with FCM](https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm) ("no first-party web push channel"; service worker + Firebase SDK + `getToken` + channel data; the iOS install check)
- Repo grounding: `README.md` (React Router v8 SSR, Vite 7, Knock free Developer account) and a direct scan of `public/` + `app/` (no manifest, service worker, or push code today).
