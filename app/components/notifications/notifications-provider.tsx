import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  KnockProvider,
  useKnockClient,
  useNotifications,
} from "@knocklabs/react";

// ─── The notifications island ───
// The one client-side provider surface of the notification system: Knock's
// client and feed, mounted once over the SSR shell so both the sidebar badge
// and the /notifications page read the same feed — one realtime socket, one
// store, one unread count. The prebuilt feed components are never used;
// consumers render their own rows through the pure formatter in
// ~/lib/notification-rows.
//
// SSR safety: the provider renders on the server as an idle shell —
// `enabled` is false until an effect flips it after hydration, so no
// identify call, no feed fetch and no socket ever happens during SSR, and
// the hydrated tree matches the server tree exactly. The DevUI user switch
// is a full-document POST, so the provider remounts fresh with the new
// user's feed; the layout additionally keys this provider by user id, so
// any client-side identity change re-establishes the client the same way.

type FeedClient = ReturnType<typeof useNotifications>;

type NotificationFeedValue = {
  feedClient: FeedClient;
};

const NotificationFeedContext = createContext<NotificationFeedValue | null>(
  null
);

/**
 * The feed client for the current user, or null when notifications are not
 * configured (no Knock keys) or nobody is signed in. Callers render their
 * idle state on null instead of reaching for the hooks.
 */
export function useNotificationFeed(): NotificationFeedValue | null {
  return useContext(NotificationFeedContext);
}

export function NotificationsProvider({
  apiKey,
  feedChannelId,
  userId,
  children,
}: {
  apiKey: string;
  feedChannelId: string;
  userId: number;
  children: ReactNode;
}) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(true);
  }, []);

  return (
    <KnockProvider
      apiKey={apiKey}
      user={{ id: String(userId) }}
      enabled={active}
    >
      <FeedChannel feedChannelId={feedChannelId}>{children}</FeedChannel>
    </KnockProvider>
  );
}

function FeedChannel({
  feedChannelId,
  children,
}: {
  feedChannelId: string;
  children: ReactNode;
}) {
  const knockClient = useKnockClient();
  const feedClient = useNotifications(knockClient, feedChannelId);

  // The one read that fills the badge and the feed on load; the managed
  // realtime socket keeps both current from here on. The fetch itself
  // no-ops until the client is authenticated, so this also re-runs — and
  // reads — exactly when a DevUI identity switch re-establishes the feed.
  useEffect(() => {
    feedClient.fetch();
  }, [feedClient]);

  return (
    <NotificationFeedContext.Provider value={{ feedClient }}>
      {children}
    </NotificationFeedContext.Provider>
  );
}
