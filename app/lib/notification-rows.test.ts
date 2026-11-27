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

  it("sends a decided Refund Request to the buyer's settings refund history", () => {
    expect(notificationDeepLink("refund-request-decided")).toBe("/settings");
  });

  it("sends a lesson comment to the Instructor's Q&A queue", () => {
    expect(notificationDeepLink("lesson-comment-posted")).toBe(
      "/instructor/questions"
    );
  });

  it("sends a comment reply to the lesson thread it happened in", () => {
    expect(
      notificationDeepLink("comment-reply-posted", {
        courseTitle: "Introduction to TypeScript",
        courseSlug: "introduction-to-typescript",
        lessonId: 5,
        lessonTitle: "Union Narrowing",
      })
    ).toBe("/courses/introduction-to-typescript/lessons/5");
  });

  it("falls back to Browse Courses when a reply's data lost the thread fields", () => {
    expect(
      notificationDeepLink("comment-reply-posted", { courseTitle: "Lost" })
    ).toBe("/courses");
  });

  it("sends a course rating to the Instructor's analytics", () => {
    expect(notificationDeepLink("course-rating-left")).toBe(
      "/instructor/analytics"
    );
  });

  it("sends a claimed Seat to the Team Admin's team page", () => {
    expect(notificationDeepLink("seat-claimed")).toBe("/team");
  });

  it("falls back to Browse Courses for a workflow the map does not know", () => {
    expect(notificationDeepLink("some-future-event")).toBe("/courses");
  });

  it("sends a publish or archive to the Instructor's course home", () => {
    expect(
      notificationDeepLink("course-status-changed", { courseId: 7 })
    ).toBe("/instructor/7");
  });

  it("keeps a course-status Notification that lost its course on Browse Courses", () => {
    expect(notificationDeepLink("course-status-changed", null)).toBe("/courses");
  });

  it("sends a new lesson to the lesson it is about", () => {
    expect(
      notificationDeepLink("new-lesson-available", {
        courseTitle: "Introduction to TypeScript",
        courseSlug: "introduction-to-typescript",
        lessonId: 5,
        lessonTitle: "Union Narrowing",
      })
    ).toBe("/courses/introduction-to-typescript/lessons/5");
  });

  it("keeps a new-lesson Notification that lost its lesson on Browse Courses", () => {
    expect(
      notificationDeepLink("new-lesson-available", { courseTitle: "Lost" })
    ).toBe("/courses");
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

  it("formats a course rating into actor, action, course and link", () => {
    const input: NotificationRowInput = {
      id: "item-3",
      workflowKey: "course-rating-left",
      actorName: "Rita Rater",
      actorAvatarUrl: "https://cdn.example.com/rita.png",
      insertedAt: "2026-11-27T10:00:00.000Z",
      readAt: null,
      data: { courseTitle: "Introduction to TypeScript", rating: 5 },
    };

    expect(formatNotificationRow(input)).toEqual({
      id: "item-3",
      state: "unread",
      actorName: "Rita Rater",
      actorAvatarUrl: "https://cdn.example.com/rita.png",
      actionText: "rated your course",
      contextLine: "Introduction to TypeScript",
      iconType: "star",
      deepLink: "/instructor/analytics",
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

  it("formats an approved Refund Request decision into actor, action, course and link", () => {
    const input: NotificationRowInput = {
      id: "item-3",
      workflowKey: "refund-request-decided",
      actorName: "Alex Rivera",
      actorAvatarUrl: "https://cdn.example.com/alex.png",
      insertedAt: "2026-11-27T10:00:00.000Z",
      readAt: null,
      data: {
        decision: "approved",
        note: "Refunded in full.",
        courseTitle: "Introduction to TypeScript",
        amountPaid: 7900,
      },
    };

    expect(formatNotificationRow(input)).toEqual({
      id: "item-3",
      state: "unread",
      actorName: "Alex Rivera",
      actorAvatarUrl: "https://cdn.example.com/alex.png",
      actionText: "approved your refund request",
      contextLine: "Introduction to TypeScript",
      iconType: "refund",
      deepLink: "/settings",
      insertedAt: "2026-11-27T10:00:00.000Z",
    });
  });

  it("formats a declined Refund Request decision into actor, action, course and link", () => {
    const input: NotificationRowInput = {
      id: "item-4",
      workflowKey: "refund-request-decided",
      actorName: "Alex Rivera",
      actorAvatarUrl: null,
      insertedAt: "2026-11-27T10:00:00.000Z",
      readAt: null,
      data: {
        decision: "declined",
        note: "You have completed most of the course.",
        courseTitle: "Introduction to TypeScript",
        amountPaid: 7900,
      },
    };

    expect(formatNotificationRow(input)).toEqual({
      id: "item-4",
      state: "unread",
      actorName: "Alex Rivera",
      actorAvatarUrl: null,
      actionText: "declined your refund request",
      contextLine: "Introduction to TypeScript",
      iconType: "refund",
      deepLink: "/settings",
      insertedAt: "2026-11-27T10:00:00.000Z",
    });
  });

  it("formats a lesson comment into actor, action, course and the Q&A queue link", () => {
    const input: NotificationRowInput = {
      id: "item-6",
      workflowKey: "lesson-comment-posted",
      actorName: "Emma Wilson",
      actorAvatarUrl: "https://cdn.example.com/emma.png",
      insertedAt: "2026-11-27T10:00:00.000Z",
      readAt: null,
      data: {
        courseTitle: "Introduction to TypeScript",
        lessonTitle: "Union Narrowing",
      },
    };

    expect(formatNotificationRow(input)).toEqual({
      id: "item-6",
      state: "unread",
      actorName: "Emma Wilson",
      actorAvatarUrl: "https://cdn.example.com/emma.png",
      actionText: "commented on your lesson",
      contextLine: "Introduction to TypeScript",
      iconType: "comment",
      deepLink: "/instructor/questions",
      insertedAt: "2026-11-27T10:00:00.000Z",
    });
  });

  it("formats a comment reply into actor, action, course and the lesson thread link", () => {
    const input: NotificationRowInput = {
      id: "item-7",
      workflowKey: "comment-reply-posted",
      actorName: "Sarah Chen",
      actorAvatarUrl: "https://cdn.example.com/sarah.png",
      insertedAt: "2026-11-27T10:00:00.000Z",
      readAt: null,
      data: {
        courseTitle: "Introduction to TypeScript",
        courseSlug: "introduction-to-typescript",
        lessonId: 5,
        lessonTitle: "Union Narrowing",
      },
    };

    expect(formatNotificationRow(input)).toEqual({
      id: "item-7",
      state: "unread",
      actorName: "Sarah Chen",
      actorAvatarUrl: "https://cdn.example.com/sarah.png",
      actionText: "replied to your comment",
      contextLine: "Introduction to TypeScript",
      iconType: "reply",
      deepLink: "/courses/introduction-to-typescript/lessons/5",
      insertedAt: "2026-11-27T10:00:00.000Z",
    });
  });

  it("formats a claimed Seat into actor, action, course and the team page link", () => {
    const input: NotificationRowInput = {
      id: "item-8",
      workflowKey: "seat-claimed",
      actorName: "Casey Claimer",
      actorAvatarUrl: "https://cdn.example.com/casey.png",
      insertedAt: "2026-11-27T10:00:00.000Z",
      readAt: null,
      data: {
        courseTitle: "Building REST APIs with Node.js",
        claimerName: "Casey Claimer",
      },
    };

    expect(formatNotificationRow(input)).toEqual({
      id: "item-8",
      state: "unread",
      actorName: "Casey Claimer",
      actorAvatarUrl: "https://cdn.example.com/casey.png",
      actionText: "claimed a Seat",
      contextLine: "Building REST APIs with Node.js",
      iconType: "seat",
      deepLink: "/team",
      insertedAt: "2026-11-27T10:00:00.000Z",
    });
  });

  it("formats a published course into actor, action, course and the course home link", () => {
    const input: NotificationRowInput = {
      id: "item-9",
      workflowKey: "course-status-changed",
      actorName: "Alex Rivera",
      actorAvatarUrl: "https://cdn.example.com/alex.png",
      insertedAt: "2026-11-27T10:00:00.000Z",
      readAt: null,
      data: {
        courseId: 4,
        courseTitle: "Shipping with Docker and Kubernetes",
        fromStatus: "draft",
        toStatus: "published",
        status: "published",
      },
    };

    expect(formatNotificationRow(input)).toEqual({
      id: "item-9",
      state: "unread",
      actorName: "Alex Rivera",
      actorAvatarUrl: "https://cdn.example.com/alex.png",
      actionText: "published your course",
      contextLine: "Shipping with Docker and Kubernetes",
      iconType: "course",
      deepLink: "/instructor/4",
      insertedAt: "2026-11-27T10:00:00.000Z",
    });
  });

  it("formats an archived course with the archive's own action text", () => {
    const input: NotificationRowInput = {
      id: "item-10",
      workflowKey: "course-status-changed",
      actorName: "Alex Rivera",
      actorAvatarUrl: null,
      insertedAt: "2026-11-27T10:00:00.000Z",
      readAt: null,
      data: {
        courseId: 1,
        courseTitle: "Introduction to TypeScript",
        fromStatus: "published",
        toStatus: "archived",
        status: "archived",
      },
    };

    expect(formatNotificationRow(input)).toEqual({
      id: "item-10",
      state: "unread",
      actorName: "Alex Rivera",
      actorAvatarUrl: null,
      actionText: "archived your course",
      contextLine: "Introduction to TypeScript",
      iconType: "course",
      deepLink: "/instructor/1",
      insertedAt: "2026-11-27T10:00:00.000Z",
    });
  });

  it("formats a new lesson into actor, action, course and the lesson link", () => {
    const input: NotificationRowInput = {
      id: "item-12",
      workflowKey: "new-lesson-available",
      actorName: "Sarah Chen",
      actorAvatarUrl: "https://cdn.example.com/sarah.png",
      insertedAt: "2026-11-27T10:00:00.000Z",
      readAt: null,
      data: {
        courseTitle: "Introduction to TypeScript",
        courseSlug: "introduction-to-typescript",
        lessonId: 5,
        lessonTitle: "Union Narrowing",
      },
    };

    expect(formatNotificationRow(input)).toEqual({
      id: "item-12",
      state: "unread",
      actorName: "Sarah Chen",
      actorAvatarUrl: "https://cdn.example.com/sarah.png",
      actionText: "published a new lesson",
      contextLine: "Introduction to TypeScript",
      iconType: "lesson",
      deepLink: "/courses/introduction-to-typescript/lessons/5",
      insertedAt: "2026-11-27T10:00:00.000Z",
    });
  });

  it("falls back to the course-status action text when the status did not travel with the Notification", () => {
    const input: NotificationRowInput = {
      id: "item-11",
      workflowKey: "course-status-changed",
      actorName: null,
      actorAvatarUrl: null,
      insertedAt: "2026-11-27T10:00:00.000Z",
      readAt: null,
      data: null,
    };

    expect(formatNotificationRow(input).actionText).toBe(
      "changed your course's status"
    );
  });

  it("falls back to the decided action text when the decision did not travel with the Notification", () => {
    const input: NotificationRowInput = {
      id: "item-5",
      workflowKey: "refund-request-decided",
      actorName: null,
      actorAvatarUrl: null,
      insertedAt: "2026-11-27T10:00:00.000Z",
      readAt: null,
      data: null,
    };

    expect(formatNotificationRow(input).actionText).toBe(
      "decided your refund request"
    );
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


