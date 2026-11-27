// PROTOTYPE (wayfinder #6 — https://github.com/vladgafarov/cohort-005-project/issues/6)
// Throwaway UI prototype — never merge; lives only on branch research/notifications-ux.
//
// Variant B of the notification center: a dedicated /notifications page linked
// from a sidebar nav item (PrototypeNavNotifications). The whole center lives
// here — no bell, no dropdown, no drawer. Rows are fixtures; read state is
// in-memory and resets on reload.

import { useContext, useState } from "react";
import { Link, data, isRouteErrorResponse } from "react-router";
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/notifications";
import { db } from "~/db";
import { teamMembers, TeamMemberRole, users } from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import { UserAvatar } from "~/components/user-avatar";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { AlertTriangle, Check, CheckCheck, Inbox } from "lucide-react";
import {
  PROTOTYPE_EVENT_META,
  type PrototypeNotification,
} from "~/lib/prototype-notifications";
import {
  PrototypeNotificationsContext,
  usePrototypeNotificationsState,
} from "~/components/prototype-notification-center";

export function meta() {
  return [{ title: "Notifications — Cadence" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to view notifications.", {
      status: 401,
    });
  }

  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!currentUser) {
    throw data("User not found.", { status: 404 });
  }

  // Team Admin flag, same as layout.app.tsx — seat-claim fixtures need it.
  const membership = db
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, currentUser.id),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .get();

  return {
    role: currentUser.role,
    isTeamAdmin: !!membership,
  };
}

export default function NotificationsPage({
  loaderData,
}: Route.ComponentProps) {
  const { role, isTeamAdmin } = loaderData;

  // Under ?variant=B the layout's provider owns the state (so the sidebar
  // badge and the page agree); a direct visit falls back to local state.
  const fromLayout = useContext(PrototypeNotificationsContext);
  const local = usePrototypeNotificationsState(role, isTeamAdmin);
  const state = fromLayout ?? local;

  // Filtering is page-local; the badge counts real read state.
  const [filterUnread, setFilterUnread] = useState(false);

  const all = state.notifications;
  const visible = filterUnread
    ? all.filter((n) => !state.isRead(n.id))
    : all;

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Notifications</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="mt-1 text-muted-foreground">
            Events you didn't cause, from across Cadence.
          </p>
        </div>
        {state.unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={state.markAllRead}>
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        )}
      </div>

      <div className="mb-4 flex w-fit gap-1 rounded-lg bg-muted p-1">
        <FilterTab
          active={!filterUnread}
          label="All"
          onClick={() => setFilterUnread(false)}
        />
        <FilterTab
          active={filterUnread}
          label={`Unread${state.unreadCount > 0 ? ` (${state.unreadCount})` : ""}`}
          onClick={() => setFilterUnread(true)}
        />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border px-4 py-16 text-center">
          <Inbox className="mx-auto mb-3 size-8 text-muted-foreground/60" />
          <p className="font-medium">You're all caught up</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filterUnread
              ? "No unread notifications."
              : "Nothing to catch up on."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <DayHeader label="Today" hidden={filterUnread} />
          {visible
            .filter((n) => n.bucket === "today")
            .map((n) => (
              <PageRow
                key={n.id}
                n={n}
                read={state.isRead(n.id)}
                onVisit={() => state.markRead(n.id)}
                onMarkRead={() => state.markRead(n.id)}
              />
            ))}
          <DayHeader label="Earlier" hidden={filterUnread} />
          {visible
            .filter((n) => n.bucket === "earlier")
            .map((n) => (
              <PageRow
                key={n.id}
                n={n}
                read={state.isRead(n.id)}
                onVisit={() => state.markRead(n.id)}
                onMarkRead={() => state.markRead(n.id)}
              />
            ))}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground/70">
        PROTOTYPE — variant B of wayfinder #6: fixture rows, no live feed; read
        state resets on reload.
      </p>
    </div>
  );
}

function FilterTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-sm transition-colors",
        active
          ? "bg-background font-medium shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function DayHeader({ label, hidden }: { label: string; hidden: boolean }) {
  return (
    <div className="bg-muted/50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
      {hidden && (
        <span className="ml-2 font-normal normal-case tracking-normal opacity-60">
          (unread only)
        </span>
      )}
    </div>
  );
}

function PageRow({
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
        "flex items-start gap-3 border-t px-4 py-3 transition-colors first:border-t-0 hover:bg-muted/30",
        !read && "bg-primary/[0.04]"
      )}
    >
      <Link
        to={n.deepLink}
        onClick={onVisit}
        className="flex min-w-0 flex-1 items-start gap-3"
      >
        <span className="relative shrink-0">
          <UserAvatar
            name={n.actorName}
            avatarUrl={n.actorAvatarUrl}
            className="size-9"
          />
          <span
            className={cn(
              "absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border-2 border-background",
              read ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"
            )}
            title={PROTOTYPE_EVENT_META[n.eventType].label}
          >
            <Icon className="size-2.5" />
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-snug">
            <span
              className={cn(
                read ? "font-medium text-foreground/80" : "font-semibold"
              )}
            >
              {n.actorName}
            </span>{" "}
            <span className={read ? "text-foreground/75" : "text-foreground"}>
              {n.text}
            </span>
          </span>
          {n.context && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
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
          className="mt-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Check className="size-4" />
        </button>
      )}
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 404) {
      title = "User not found";
      message = typeof error.data === "string" ? error.data : "User not found.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
