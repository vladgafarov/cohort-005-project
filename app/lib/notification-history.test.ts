import { describe, it, expect } from "vitest";
import type { NotificationRow } from "./notification-rows";
import {
  filterNotificationRows,
  groupNotificationRows,
} from "./notification-history";

// A formatted row, built by hand from the same vocabulary the formatter
// emits — the tests below observe only what the rows carry, never how
// they were formatted.
function aRow(id: string, state: "unread" | "read"): NotificationRow {
  return {
    id,
    state,
    actorName: "Emma Wilson",
    actorAvatarUrl: null,
    actionText: "requested a refund",
    contextLine: "Introduction to TypeScript",
    iconType: "refund",
    deepLink: "/admin/refunds",
    insertedAt: "2026-11-27T09:00:00.000Z",
  };
}

describe("filterNotificationRows", () => {
  it("keeps every row under All — a Read Notification stays in the feed", () => {
    const unread = aRow("item-1", "unread");
    const read = aRow("item-2", "read");

    expect(filterNotificationRows([unread, read], "all")).toEqual([
      unread,
      read,
    ]);
  });

  it("shows only Notifications not yet read under Unread, in feed order", () => {
    const rows = [
      aRow("item-1", "unread"),
      aRow("item-2", "read"),
      aRow("item-3", "unread"),
    ];

    const filtered = filterNotificationRows(rows, "unread");

    expect(filtered.map((row) => row.id)).toEqual(["item-1", "item-3"]);
    expect(filtered.every((row) => row.state === "unread")).toBe(true);
  });

  it("leaves nothing under Unread once the backlog is cleared", () => {
    const rows = [aRow("item-1", "read"), aRow("item-2", "read")];

    expect(filterNotificationRows(rows, "unread")).toEqual([]);
  });
});

describe("groupNotificationRows", () => {
  // Built in local calendar terms on purpose: the boundary these tests
  // pin is the calendar day, so `now` and every row share one local
  // calendar, whatever timezone the machine running the suite is in.
  const now = new Date(2026, 10, 27, 12, 0); // 27 Nov 2026, local noon.

  function rowAt(id: string, when: Date): NotificationRow {
    return { ...aRow(id, "unread"), insertedAt: when.toISOString() };
  }

  it("groups the day's Notifications under Today, keeping feed order", () => {
    const morning = rowAt("item-1", new Date(2026, 10, 27, 9, 0));
    const midday = rowAt("item-2", new Date(2026, 10, 27, 11, 30));

    expect(groupNotificationRows([midday, morning], now)).toEqual([
      { label: "Today", rows: [midday, morning] },
    ]);
  });

  it("groups Notifications from before today under Earlier, keeping feed order", () => {
    const yesterday = rowAt("item-1", new Date(2026, 10, 26, 18, 0));
    const tenDaysBack = rowAt("item-2", new Date(2026, 10, 17, 9, 0));

    expect(groupNotificationRows([tenDaysBack, yesterday], now)).toEqual([
      { label: "Earlier", rows: [tenDaysBack, yesterday] },
    ]);
  });

  it("splits a mixed feed into Today first, then Earlier", () => {
    const morning = rowAt("item-1", new Date(2026, 10, 27, 9, 0));
    const yesterday = rowAt("item-2", new Date(2026, 10, 26, 18, 0));
    const tenDaysBack = rowAt("item-3", new Date(2026, 10, 17, 9, 0));

    const groups = groupNotificationRows(
      [yesterday, morning, tenDaysBack],
      now
    );

    expect(groups.map((group) => group.label)).toEqual(["Today", "Earlier"]);
    expect(groups[0]?.rows.map((row) => row.id)).toEqual(["item-1"]);
    expect(groups[1]?.rows.map((row) => row.id)).toEqual(["item-2", "item-3"]);
  });

  it("puts yesterday's late evening under Earlier an hour after midnight", () => {
    // The boundary is the calendar day, not a rolling twenty-four hours:
    // half an hour before midnight is Today at 11:59 and Earlier at 00:30.
    const justAfterMidnight = new Date(2026, 10, 27, 0, 30);
    const lastNight = rowAt("item-1", new Date(2026, 10, 26, 23, 30));

    expect(groupNotificationRows([lastNight], justAfterMidnight)).toEqual([
      { label: "Earlier", rows: [lastNight] },
    ]);
  });

  it("keeps a future-stamped Notification with Today", () => {
    // Clock skew only ever runs one way in practice: a row stamped ahead
    // of the recipient's clock is fresh, not a month old, and must not be
    // buried under Earlier.
    const ahead = rowAt("item-1", new Date(2026, 10, 28, 9, 0));

    expect(groupNotificationRows([ahead], now)).toEqual([
      { label: "Today", rows: [ahead] },
    ]);
  });

  it("returns no groups for an empty feed", () => {
    expect(groupNotificationRows([], now)).toEqual([]);
  });
});

