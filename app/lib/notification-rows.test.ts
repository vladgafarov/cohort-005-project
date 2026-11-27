import { describe, it, expect } from "vitest";
import {
  formatNotificationRow,
  formatRelativeTime,
  notificationDeepLink,
  type NotificationRowInput,
} from "./notification-rows";

describe("notification deep links", () => {
  it("sends a raised Refund Request to the Platform Admin refund queue", () => {
    expect(notificationDeepLink("refund-request-raised")).toBe("/admin/refunds");
  });

  it("falls back to Browse Courses for a workflow the map does not know", () => {
    expect(notificationDeepLink("some-future-event")).toBe("/courses");
  });
});

describe("formatNotificationRow", () => {
  it("formats a raised Refund Request into actor, action, course and link", () => {
    const input: NotificationRowInput = {
      id: "item-1",
      workflowKey: "refund-request-raised",
      actorName: "Emma Wilson",
      actorAvatarUrl: "https://cdn.example.com/emma.png",
      insertedAt: "2026-11-27T10:00:00.000Z",
      readAt: null,
      data: { courseTitle: "Introduction to TypeScript", reason: "Not for me" },
    };

    expect(formatNotificationRow(input)).toEqual({
      id: "item-1",
      state: "unread",
      actorName: "Emma Wilson",
      actorAvatarUrl: "https://cdn.example.com/emma.png",
      actionText: "requested a refund",
      contextLine: "Introduction to TypeScript",
      iconType: "refund",
      deepLink: "/admin/refunds",
      insertedAt: "2026-11-27T10:00:00.000Z",
    });
  });

  it("marks a Notification its recipient has clicked through as Read", () => {
    const input: NotificationRowInput = {
      id: "item-1",
      workflowKey: "refund-request-raised",
      actorName: "Emma Wilson",
      actorAvatarUrl: null,
      insertedAt: "2026-11-27T10:00:00.000Z",
      readAt: "2026-11-27T11:00:00.000Z",
      data: { courseTitle: "Introduction to TypeScript", reason: "Not for me" },
    };

    expect(formatNotificationRow(input).state).toBe("read");
  });

  it("survives a Notification that arrives without an actor or context", () => {
    const input: NotificationRowInput = {
      id: "item-2",
      workflowKey: "some-future-event",
      actorName: null,
      actorAvatarUrl: null,
      insertedAt: "2026-11-27T10:00:00.000Z",
      readAt: null,
      data: null,
    };

    const row = formatNotificationRow(input);

    expect(row.actorName).toBe("Someone");
    expect(row.actionText).toBe("sent you a notification");
    expect(row.contextLine).toBeNull();
    expect(row.iconType).toBe("bell");
    expect(row.deepLink).toBe("/courses");
  });
});

describe("formatRelativeTime", () => {
  // Pinned to an explicit instant, not the machine's timezone.
  const NOW = new Date("2026-11-27T12:00:00.000Z");

  it("says just now for a Notification from the past minute", () => {
    expect(formatRelativeTime("2026-11-27T11:59:30.000Z", NOW)).toBe(
      "just now"
    );
  });

  it("counts in minutes within the hour", () => {
    expect(formatRelativeTime("2026-11-27T11:20:00.000Z", NOW)).toBe("40m ago");
  });

  it("counts in hours within the day", () => {
    expect(formatRelativeTime("2026-11-27T04:00:00.000Z", NOW)).toBe("8h ago");
  });

  it("counts in days within the week", () => {
    expect(formatRelativeTime("2026-11-24T12:00:00.000Z", NOW)).toBe("3d ago");
  });

  it("falls back to the calendar date beyond a week", () => {
    expect(formatRelativeTime("2026-11-12T10:00:00.000Z", NOW)).toBe("Nov 12");
  });
});


