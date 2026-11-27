// ─── Notification history ───
// The pure vocabulary for the feed's history shape: the All/Unread filter
// and the Today/Earlier grouping that turn the flat, newest-first page of
// rows into a history a user can work through. Client-safe on purpose —
// the feed island renders in the browser — and pure like the
// notification-rows module, so the feed's one standing guarantee, that a
// Read Notification stays in the feed (a history, not a queue: nothing
// expires, nothing is deleted), is pinned here, by a test, and not left
// to the rendering code.

import type { NotificationRow } from "./notification-rows";

// ─── The All / Unread filter ───
// "All" is the history: every row the feed holds, Read and Unread alike.
// "Unread" is the backlog: just the rows the recipient has not dealt
// with yet, so they can be worked through without scrolling the past.

export type NotificationFilter = "all" | "unread";

export function filterNotificationRows<T extends NotificationRow>(
  rows: T[],
  filter: NotificationFilter
): T[] {
  if (filter === "unread") {
    return rows.filter((row) => row.state === "unread");
  }

  return rows;
}

// ─── The Today / Earlier grouping ───
// The recent past is findable without scrolling the whole history: the
// day's rows sit under Today, everything older under Earlier. The
// boundary is the calendar day, not a rolling twenty-four hours — half
// an hour before midnight is Today at 11:59 and Earlier at 00:30 — and
// grouping never re-sorts: the feed's newest-first order holds inside
// each group. Empty sections are omitted rather than shown with nothing
// under them.

export type NotificationRowGroup<T extends NotificationRow = NotificationRow> =
  {
    label: "Today" | "Earlier";
    rows: T[];
  };

function landedToday(insertedAt: string, now: Date): boolean {
  const when = new Date(insertedAt);

  // Clock skew runs one way in practice: a stamp ahead of the clock is
  // fresh, not a month old, so it stays with Today. (A stamp that cannot
  // be read at all fails every check below and lands with Earlier.)
  if (when.getTime() > now.getTime()) return true;

  return (
    when.getFullYear() === now.getFullYear() &&
    when.getMonth() === now.getMonth() &&
    when.getDate() === now.getDate()
  );
}

export function groupNotificationRows<T extends NotificationRow>(
  rows: T[],
  now: Date
): NotificationRowGroup<T>[] {
  const today: T[] = [];
  const earlier: T[] = [];

  for (const row of rows) {
    if (landedToday(row.insertedAt, now)) {
      today.push(row);
    } else {
      earlier.push(row);
    }
  }

  const groups: NotificationRowGroup<T>[] = [];

  if (today.length > 0) groups.push({ label: "Today", rows: today });
  if (earlier.length > 0) groups.push({ label: "Earlier", rows: earlier });

  return groups;
}

