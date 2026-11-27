import { useNotificationStore } from "@knocklabs/react";
import type { useNotifications } from "@knocklabs/react";
import { useNotificationFeed } from "./notifications-provider";

type FeedClient = ReturnType<typeof useNotifications>;

/**
 * The unread count for the Notifications sidebar item. Unread, not the
 * provider's unseen count: the badge clears only as rows are actually read,
 * and the feed marks rows seen on open while the badge keeps counting
 * until the recipient reads them.
 */
export function NotificationsBadge() {
  const feed = useNotificationFeed();

  if (!feed) return null;

  return <UnreadCount feedClient={feed.feedClient} />;
}

function UnreadCount({ feedClient }: { feedClient: FeedClient }) {
  const unreadCount = useNotificationStore(
    feedClient,
    (state) => state.metadata.unread_count
  );

  if (unreadCount <= 0) return null;

  return (
    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  );
}
