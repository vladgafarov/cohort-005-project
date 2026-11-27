import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  Bell,
  Check,
  CheckCheck,
  MessageSquare,
  Receipt,
  Reply,
  Star,
} from "lucide-react";
import { useNotificationStore } from "@knocklabs/react";
import type { useNotifications } from "@knocklabs/react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import { useNotificationFeed } from "./notifications-provider";
import {
  formatNotificationRow,
  formatRelativeTime,
  type NotificationIconType,
  type NotificationRow,
  type NotificationRowInput,
} from "~/lib/notification-rows";
import {
  filterNotificationRows,
  groupNotificationRows,
  type NotificationFilter,
} from "~/lib/notification-history";

type FeedClient = ReturnType<typeof useNotifications>;
type StoreItem = ReturnType<FeedClient["getState"]>["items"][number];

// A formatted row with the Notification it was formatted from riding
// along: the pure filter and grouping functions carry it through the
// pipeline untouched, so a row's actions can still reach the feed client.
type FeedEntry = NotificationRow & { item: StoreItem };

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
    case "comment":
      return <MessageSquare className="size-3" />;
    case "reply":
      return <Reply className="size-3" />;
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
 * one of two states, Unread or Read. The feed behaves as a history, not
 * a queue: rows group into Today and Earlier, an All / Unread filter
 * covers just what's new, a row can be marked Read without navigating,
 * and Mark-all-read clears the backlog in one action. Read rows stay
 * under All forever — nothing expires, nothing is deleted.
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
  const unreadCount = useNotificationStore(
    feedClient,
    (state) => state.metadata.unread_count
  );
  const [filter, setFilter] = useState<NotificationFilter>("all");

  if (!received) {
    return <EmptyNote>Loading notifications…</EmptyNote>;
  }

  // The flat, newest-first page, formatted once. Every decision from
  // here on belongs to the pure functions: which rows a filter keeps,
  // and which group a row lands in.
  const entries: FeedEntry[] = items.map((item) => ({
    ...formatNotificationRow(rowInputFromItem(item)),
    item,
  }));

  const groups = groupNotificationRows(
    filterNotificationRows(entries, filter),
    new Date()
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex h-8 items-center rounded-lg bg-muted p-1 text-sm text-muted-foreground">
          <FilterTab active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </FilterTab>
          <FilterTab
            active={filter === "unread"}
            onClick={() => setFilter("unread")}
          >
            Unread
          </FilterTab>
        </div>
        {/* Mark-all-read clears the backlog in one action. It only
            appears while there is one to clear — the badge, which counts
            the same Unread rows, falls with it to nothing. */}
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => feedClient.markAllAsRead()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <CheckCheck className="size-4" />
            Mark all read
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <EmptyNote>You're all caught up.</EmptyNote>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="mb-6 last:mb-0">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </h2>
            <div className="space-y-2">
              {group.rows.map((entry) => (
                <FeedRow key={entry.id} entry={entry} feedClient={feedClient} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md px-3 py-1 font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function FeedRow({
  entry,
  feedClient,
}: {
  entry: FeedEntry;
  feedClient: FeedClient;
}) {
  return (
    <div
      className={cn(
        "flex items-stretch gap-1 rounded-lg border transition-colors",
        entry.state === "unread"
          ? "border-primary/20 bg-primary/5"
          : "border-border bg-transparent"
      )}
    >
      <Link
        to={entry.deepLink}
        onClick={() => {
          // Following up also tidies the feed: the row becomes Read, and
          // it stays in the feed — a history, not a queue.
          feedClient.markAsRead([entry.item]);
        }}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-lg p-4 transition-colors hover:bg-accent"
      >
        <div className="relative shrink-0">
          <UserAvatar
            name={entry.actorName}
            avatarUrl={entry.actorAvatarUrl}
          />
          <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border border-background bg-primary text-primary-foreground">
            {eventIcon(entry.iconType)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span
              className={cn(
                "font-medium",
                entry.state === "unread"
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {entry.actorName}
            </span>{" "}
            {entry.actionText}
          </p>
          {entry.contextLine && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {entry.contextLine}
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatRelativeTime(entry.insertedAt, new Date())}
        </span>
      </Link>
      {/* Marking a row Read without opening it: the badge drops by one,
          the row leaves the Unread filter, and it stays in the feed
          under All. */}
      {entry.state === "unread" && (
        <button
          type="button"
          onClick={() => feedClient.markAsRead([entry.item])}
          title="Mark as read"
          aria-label={`Mark the notification from ${entry.actorName} as read`}
          className="my-2 mr-2 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Check className="size-4" />
        </button>
      )}
    </div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
