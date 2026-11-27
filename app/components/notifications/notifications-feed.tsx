import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Bell, Receipt, Star } from "lucide-react";
import { useNotificationStore } from "@knocklabs/react";
import type { useNotifications } from "@knocklabs/react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import { useNotificationFeed } from "./notifications-provider";
import {
  formatNotificationRow,
  formatRelativeTime,
  type NotificationIconType,
  type NotificationRowInput,
} from "~/lib/notification-rows";

type FeedClient = ReturnType<typeof useNotifications>;
type StoreItem = ReturnType<FeedClient["getState"]>["items"][number];

// The shape the row formatter consumes, read off a Notification at the
// boundary: which Event it reports (the workflow key stamped on it), who
// acted, when it landed, whether it has been read, and its flat trigger
// data.
function rowInputFromItem(item: StoreItem): NotificationRowInput {
  const actor = item.actors[0];
  const actorName = actor && "name" in actor ? actor.name : null;
  const actorAvatarUrl = actor && "avatar" in actor ? actor.avatar : null;

  return {
    id: item.id,
    workflowKey: item.source.key,
    actorName,
    actorAvatarUrl,
    insertedAt: item.inserted_at,
    readAt: item.read_at,
    data: item.data,
  };
}

function eventIcon(iconType: NotificationIconType): ReactNode {
  switch (iconType) {
    case "refund":
      return <Receipt className="size-3" />;
    case "star":
      return <Star className="size-3" />;
    case "bell":
      return <Bell className="size-3" />;
  }
}

/**
 * The Notification feed: a client island over the SSR shell, reading the
 * shared feed client from the provider. Rows are ours — the provider's
 * prebuilt, branded components are never used — and each renders exactly
 * one of two states, Unread or Read.
 */
export function NotificationsFeed() {
  const feed = useNotificationFeed();
  const feedClient = feed?.feedClient;
  const [received, setReceived] = useState(false);

  // The first page lands after hydration; until then the feed is honest
  // about not having read anything yet, rather than pretending to be empty.
  useEffect(() => {
    if (!feedClient) return;

    const onReceivedPage = () => setReceived(true);
    feedClient.on("items.received.page", onReceivedPage);
    return () => {
      feedClient.off("items.received.page", onReceivedPage);
    };
  }, [feedClient]);

  // Opening the feed marks every row seen provider-side, keeping the
  // provider's metadata truthful; the UI itself stays read-based and never
  // renders a third state for it.
  useEffect(() => {
    feedClient?.markAllAsSeen();
  }, [feedClient]);

  if (!feed || !feedClient) {
    return (
      <EmptyNote>
        Notifications are not configured for this environment.
      </EmptyNote>
    );
  }

  return <FeedRows feedClient={feedClient} received={received} />;
}

function FeedRows({
  feedClient,
  received,
}: {
  feedClient: FeedClient;
  received: boolean;
}) {
  const items = useNotificationStore(feedClient, (state) => state.items);

  if (!received) {
    return <EmptyNote>Loading notifications…</EmptyNote>;
  }

  if (items.length === 0) {
    return <EmptyNote>You're all caught up.</EmptyNote>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <FeedRow key={item.id} item={item} feedClient={feedClient} />
      ))}
    </div>
  );
}

function FeedRow({
  item,
  feedClient,
}: {
  item: StoreItem;
  feedClient: FeedClient;
}) {
  const row = formatNotificationRow(rowInputFromItem(item));

  return (
    <Link
      to={row.deepLink}
      onClick={() => {
        // Following up also tidies the feed: the row becomes Read, and it
        // stays in the feed — a history, not a queue.
        feedClient.markAsRead([item]);
      }}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-accent",
        row.state === "unread"
          ? "border-primary/20 bg-primary/5"
          : "border-border bg-transparent"
      )}
    >
      <div className="relative shrink-0">
        <UserAvatar name={row.actorName} avatarUrl={row.actorAvatarUrl} />
        <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border border-background bg-primary text-primary-foreground">
          {eventIcon(row.iconType)}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span
            className={cn(
              "font-medium",
              row.state === "unread" ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {row.actorName}
          </span>{" "}
          {row.actionText}
        </p>
        {row.contextLine && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {row.contextLine}
          </p>
        )}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatRelativeTime(row.insertedAt, new Date())}
      </span>
    </Link>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
