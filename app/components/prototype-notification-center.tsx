// PROTOTYPE (wayfinder #6 — https://github.com/vladgafarov/cohort-005-project/issues/6)
// Throwaway UI prototype — never merge; lives only on branch research/notifications-ux.
//
// Three structurally different takes on Cadence's notification center, chosen
// by the ?variant= URL param (see PrototypeSwitcher):
//   A — PrototypeBellDropdown: bell in the sidebar opens a dropdown of recent
//       items; opening it marks everything seen, clicking a row reads it.
//   B — PrototypeNavNotifications: a "Notifications" nav item links to the
//       dedicated /notifications page (app/routes/notifications.tsx). No bell.
//   C — PrototypeBellDrawer: a bell opens a full-height inbox drawer — the
//       whole center lives in the drawer, no page.
//
// Rows are fixtures from app/lib/prototype-notifications.ts, role-aware so
// switching users in the DevUI panel switches the demo content. Read state is
// in-memory only — reload resets it, by design.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link, NavLink } from "react-router";
import { Bell, Check, Inbox, X } from "lucide-react";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";
import { UserAvatar } from "~/components/user-avatar";
import {
  PROTOTYPE_EVENT_META,
  prototypeNotificationsFor,
  type PrototypeNotification,
} from "~/lib/prototype-notifications";

// ---------------------------------------------------------------------------
// Shared state

function usePrototypeNotificationsState(
  role: UserRole | null,
  isTeamAdmin: boolean
) {
  const notifications = useMemo(
    () => prototypeNotificationsFor(role, isTeamAdmin),
    [role, isTeamAdmin]
  );

  const [readIds, setReadIds] = useState<ReadonlySet<string>>(
    () => new Set(notifications.filter((n) => n.read).map((n) => n.id))
  );
  const [opened, setOpened] = useState(false);

  // A DevUI user switch re-seeds the fixtures; stale read ids would mislabel rows.
  useEffect(() => {
    setReadIds(new Set(notifications.filter((n) => n.read).map((n) => n.id)));
    setOpened(false);
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  return {
    notifications,
    isRead: (id: string) => readIds.has(id),
    unreadCount,
    // A/C badge semantics: "unseen" — clears the moment the surface opens
    // (Knock's batch_seen), while rows stay unread until acted on.
    badgeCount: opened ? 0 : unreadCount,
    markRead: (id: string) =>
      setReadIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      }),
    markAllRead: () => setReadIds(new Set(notifications.map((n) => n.id))),
    markOpened: () => setOpened(true),
  };
}

type PrototypeNotificationsState = ReturnType<
  typeof usePrototypeNotificationsState
>;

export const PrototypeNotificationsContext =
  createContext<PrototypeNotificationsState | null>(null);

export function PrototypeNotificationProvider({
  role,
  isTeamAdmin,
  children,
}: {
  role: UserRole | null;
  isTeamAdmin: boolean;
  children: ReactNode;
}) {
  const state = usePrototypeNotificationsState(role, isTeamAdmin);
  return (
    <PrototypeNotificationsContext value={state}>
      {children}
    </PrototypeNotificationsContext>
  );
}

export function usePrototypeNotifications() {
  const state = useContext(PrototypeNotificationsContext);
  if (!state) {
    throw new Error(
      "PrototypeNotificationProvider is not mounted (?variant= missing)"
    );
  }
  return state;
}

/** For the /notifications page when visited directly, without the provider. */
export function usePrototypeNotificationsIfPresent() {
  return useContext(PrototypeNotificationsContext);
}

export { usePrototypeNotificationsState };

// ---------------------------------------------------------------------------
// Shared pieces

function PrototypeBellButton({
  badgeCount,
  onClick,
}: {
  badgeCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Notifications"
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <span className="relative">
        <Bell className="size-4" />
        {badgeCount > 0 && (
          <span className="absolute -right-2 -top-2 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold leading-none text-destructive-foreground">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </span>
      Notifications
    </button>
  );
}

function PrototypeEmptyNotifications({ message }: { message: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <Inbox className="mx-auto mb-2 size-6 text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function PrototypeFootnote() {
  return (
    <p className="border-t px-3 py-1.5 text-[10px] text-muted-foreground/70">
      PROTOTYPE · fixture rows, no live feed
    </p>
  );
}

// ---------------------------------------------------------------------------
// Variant A — bell + dropdown

export function PrototypeBellDropdown() {
  const {
    notifications,
    badgeCount,
    unreadCount,
    isRead,
    markRead,
    markAllRead,
    markOpened,
  } = usePrototypeNotifications();
  const [open, setOpen] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) markOpened(); // opening = seeing them: badge clears, rows stay unread
  }

  return (
    <div className="relative">
      <PrototypeBellButton badgeCount={badgeCount} onClick={toggle} />

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Notifications
                {unreadCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                    {unreadCount}
                  </span>
                )}
              </span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <PrototypeEmptyNotifications message="Nothing to catch up on." />
              ) : (
                notifications.slice(0, 8).map((n) => (
                  <DropdownRow
                    key={n.id}
                    n={n}
                    read={isRead(n.id)}
                    onVisit={() => {
                      markRead(n.id);
                      setOpen(false);
                    }}
                  />
                ))
              )}
            </div>

            <PrototypeFootnote />
          </div>
        </>
      )}
    </div>
  );
}

function DropdownRow({
  n,
  read,
  onVisit,
}: {
  n: PrototypeNotification;
  read: boolean;
  onVisit: () => void;
}) {
  const Icon = PROTOTYPE_EVENT_META[n.eventType].icon;
  return (
    <Link
      to={n.deepLink}
      onClick={onVisit}
      className={cn(
        "flex items-start gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-accent",
        !read && "bg-primary/5"
      )}
    >
      <span className="mt-1.5 size-2 shrink-0">
        {!read && <span className="block size-2 rounded-full bg-primary" />}
      </span>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className={cn("min-w-0 flex-1", !read && "font-medium")}>
        <span className="block truncate">
          {n.actorName} {n.text}
        </span>
        {n.context && (
          <span className="block truncate text-xs text-muted-foreground">
            {n.context}
          </span>
        )}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {n.timeLabel}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Variant B — nav item to the dedicated page

export function PrototypeNavNotifications() {
  const { unreadCount } = usePrototypeNotifications();

  return (
    <NavLink
      to="/notifications"
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Bell className="size-4" />
      Notifications
      {/* B's badge counts unread (clears only as rows are read), not unseen. */}
      {unreadCount > 0 && (
        <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </NavLink>
  );
}

// ---------------------------------------------------------------------------
// Variant C — bell + inbox drawer

export function PrototypeBellDrawer() {
  const {
    notifications,
    badgeCount,
    unreadCount,
    isRead,
    markRead,
    markAllRead,
    markOpened,
  } = usePrototypeNotifications();
  const [open, setOpen] = useState(false);

  function openDrawer() {
    setOpen(true);
    markOpened();
  }

  return (
    <>
      <PrototypeBellButton badgeCount={badgeCount} onClick={openDrawer} />

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="fixed left-0 top-0 z-50 flex h-full w-96 flex-col border-r bg-background shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Inbox className="size-4 text-muted-foreground" />
                <span className="font-semibold">Notifications</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <PrototypeEmptyNotifications message="Nothing to catch up on." />
              ) : (
                notifications.map((n) => (
                  <DrawerRow
                    key={n.id}
                    n={n}
                    read={isRead(n.id)}
                    onVisit={() => {
                      markRead(n.id);
                      setOpen(false);
                    }}
                    onMarkRead={() => markRead(n.id)}
                  />
                ))
              )}
            </div>

            <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground/70">
              PROTOTYPE · fixture rows, no live feed
            </div>
          </div>
        </>
      )}
    </>
  );
}

function DrawerRow({
  n,
  read,
  onVisit,
  onMarkRead,
}: {
  n: PrototypeNotification;
  read: boolean;
  onVisit: () => void;
  onMarkRead: () => void;
}) {
  const Icon = PROTOTYPE_EVENT_META[n.eventType].icon;
  return (
    <div
      className={cn(
        "flex items-start border-b transition-colors",
        !read && "bg-muted/50"
      )}
    >
      <Link
        to={n.deepLink}
        onClick={onVisit}
        className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/60"
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            read
              ? "bg-muted text-muted-foreground"
              : "bg-primary/10 text-primary"
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm", !read ? "font-semibold" : "font-normal text-foreground/80")}>
            {n.actorName} {n.text}
          </span>
          {n.context && (
            <span className="block truncate text-xs text-muted-foreground">
              {n.context}
            </span>
          )}
          <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
            {n.timeLabel}
          </span>
        </span>
      </Link>
      {!read && (
        <button
          type="button"
          title="Mark as read"
          onClick={onMarkRead}
          className="m-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Check className="size-4" />
        </button>
      )}
    </div>
  );
}
