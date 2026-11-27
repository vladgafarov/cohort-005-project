// ─── Notification rows ───
// The pure vocabulary for rendering a Notification as a feed row: the Event
// workflow keys, each Event's action text, icon chip and deep link, and the
// row formatter that turns a Notification's data into that row. Client-safe
// on purpose — the feed island renders it in the browser — and pure like the
// comment-markdown module, so a workflow rename or a data-shape drift is
// caught here, by a test, and not discovered as a broken row.
//
// The workflow keys mirror the workflows built in the Knock dashboard (see
// docs/notifications-workflows.md). They are durable identifiers in three
// places at once — the trigger call, the user's preference set, and the
// `source.key` stamped on every feed item — so they are constants, named,
// and pinned by name in the tests.

// "Refund Request raised" — every Platform Admin is notified when a buyer
// raises one. The tracer bullet of the notification system.
export const REFUND_REQUEST_RAISED_WORKFLOW_KEY = "refund-request-raised";

// "Refund Request decided" — the buyer is notified when a Platform Admin
// approves or declines their Open Refund Request in the refund queue. One
// Event, one workflow; the trigger data carries which decision it was.
export const REFUND_REQUEST_DECIDED_WORKFLOW_KEY = "refund-request-decided";

// "Comment posted on a lesson" — the course's Instructor is notified when a
// Student comments on one of their lessons.
export const LESSON_COMMENT_POSTED_WORKFLOW_KEY = "lesson-comment-posted";

// "Comment reply posted" — the parent comment's author is notified when
// someone replies to a comment they wrote. An Instructor's Q&A answer is
// one of these: answering in the queue inserts a reply to the question,
// so the Student who asked gets the row.
export const COMMENT_REPLY_POSTED_WORKFLOW_KEY = "comment-reply-posted";

// "Course rating left" — the course's Instructor is notified when a
// Student leaves a rating on the course page.
export const COURSE_RATING_LEFT_WORKFLOW_KEY = "course-rating-left";

// "Seat claimed" — the Team Admin who bought the Team Licence is notified
// when someone claims one of its Seats.
export const SEAT_CLAIMED_WORKFLOW_KEY = "seat-claimed";

// "Course published / archived" — the course's Instructor is notified when
// a Platform Admin publishes or archives their course in the admin course
// screens.
export const COURSE_STATUS_CHANGED_WORKFLOW_KEY = "course-status-changed";

// "New lesson available" — every user holding an Enrollment on the course
// is notified when a save brings a lesson its first consumable material.
export const NEW_LESSON_AVAILABLE_WORKFLOW_KEY = "new-lesson-available";

// ─── Deep links ───
// One target per Event: clicking a Notification takes the recipient to the
// thing it is about. The map is keyed by workflow key and covered by name in
// the tests, so renaming a workflow in the dashboard breaks a test here —
// not, silently, every row's link. Most targets are constants; an Event
// that is about one specific thing — a lesson thread, a course's home —
// reads its target out of the Notification's data instead. Rows for events
// not yet in the map fall back to Browse Courses, a page every role can
// open.

type DeepLinkTarget = string | ((data: Record<string, unknown> | null) => string);

// The lesson page a Notification about one lesson points at: the thread
// a reply's reader needs to land in to keep the conversation going, and
// the new lesson a first-material save just made worth watching.
function lessonThreadLink(data: Record<string, unknown> | null): string {
  const courseSlug = data?.courseSlug;
  const lessonId = data?.lessonId;
  if (typeof courseSlug !== "string" || typeof lessonId !== "number") {
    return FALLBACK_DEEP_LINK;
  }
  return `/courses/${courseSlug}/lessons/${lessonId}`;
}

const NOTIFICATION_DEEP_LINKS: Record<string, DeepLinkTarget> = {
  [REFUND_REQUEST_RAISED_WORKFLOW_KEY]: "/admin/refunds",
  [REFUND_REQUEST_DECIDED_WORKFLOW_KEY]: "/settings",
  [LESSON_COMMENT_POSTED_WORKFLOW_KEY]: "/instructor/questions",
  [COMMENT_REPLY_POSTED_WORKFLOW_KEY]: lessonThreadLink,
  // The Instructor sees the rating land in context: their analytics show
  // how the course is being received.
  [COURSE_RATING_LEFT_WORKFLOW_KEY]: "/instructor/analytics",
  // The Team Admin lands on the team page to see who claimed which Seat.
  [SEAT_CLAIMED_WORKFLOW_KEY]: "/team",
  // The Instructor's course home, where the course's status shows.
  [COURSE_STATUS_CHANGED_WORKFLOW_KEY]: (data) => {
    const courseId = data?.courseId;
    return typeof courseId === "number"
      ? `/instructor/${courseId}`
      : FALLBACK_DEEP_LINK;
  },
  // The lesson itself: a new-lesson row sends its recipient straight to
  // the lesson that just became worth watching.
  [NEW_LESSON_AVAILABLE_WORKFLOW_KEY]: lessonThreadLink,
};

const FALLBACK_DEEP_LINK = "/courses";

export function notificationDeepLink(
  workflowKey: string,
  data: Record<string, unknown> | null = null
): string {
  const target = NOTIFICATION_DEEP_LINKS[workflowKey] ?? FALLBACK_DEEP_LINK;
  return typeof target === "string" ? target : target(data);
}

// ─── Row formatting ───
// A Notification rendered as a feed row. The state is the user's whole
// vocabulary for a Notification — Unread or Read, never a third — and the
// rest is what the row shows: who acted, what they did, which course or
// Purchase it concerns, the event-type icon chip, and where clicking goes.

export type NotificationIconType =
  | "refund"
  | "comment"
  | "reply"
  | "star"
  | "seat"
  | "course"
  | "lesson"
  | "bell";

export type NotificationRowInput = {
  id: string;
  workflowKey: string;
  actorName: string | null;
  actorAvatarUrl: string | null;
  insertedAt: string;
  readAt: string | null;
  data: Record<string, unknown> | null;
};

export type NotificationRow = {
  id: string;
  state: "unread" | "read";
  actorName: string;
  actorAvatarUrl: string | null;
  actionText: string;
  contextLine: string | null;
  iconType: NotificationIconType;
  deepLink: string;
  insertedAt: string;
};

const NOTIFICATION_ACTION_TEXTS: Record<string, string> = {
  [REFUND_REQUEST_RAISED_WORKFLOW_KEY]: "requested a refund",
  [REFUND_REQUEST_DECIDED_WORKFLOW_KEY]: "decided your refund request",
  [LESSON_COMMENT_POSTED_WORKFLOW_KEY]: "commented on your lesson",
  [COMMENT_REPLY_POSTED_WORKFLOW_KEY]: "replied to your comment",
  [COURSE_RATING_LEFT_WORKFLOW_KEY]: "rated your course",
  [SEAT_CLAIMED_WORKFLOW_KEY]: "claimed a Seat",
  [COURSE_STATUS_CHANGED_WORKFLOW_KEY]: "changed your course's status",
  [NEW_LESSON_AVAILABLE_WORKFLOW_KEY]: "published a new lesson",
};

const FALLBACK_ACTION_TEXT = "sent you a notification";

export function notificationActionText(workflowKey: string): string {
  return NOTIFICATION_ACTION_TEXTS[workflowKey] ?? FALLBACK_ACTION_TEXT;
}

// A decided Refund Request's one action text varies with the decision the
// Platform Admin made, so the row reads the decision out of the data; the
// static map above holds the text for a Notification that arrived without
// it.
const REFUND_DECISION_ACTION_TEXTS: Record<string, string> = {
  approved: "approved your refund request",
  declined: "declined your refund request",
};

// A publish and an archive are one Event whose action text varies with
// where the Platform Admin moved the course, so the row reads the landing
// status out of the data; the static map above holds the text for a
// Notification that arrived without it.
const COURSE_STATUS_ACTION_TEXTS: Record<string, string> = {
  published: "published your course",
  archived: "archived your course",
};

function actionTextFrom(input: NotificationRowInput): string {
  if (input.workflowKey === REFUND_REQUEST_DECIDED_WORKFLOW_KEY) {
    const decision = input.data?.decision;
    if (typeof decision === "string") {
      const text = REFUND_DECISION_ACTION_TEXTS[decision];
      if (text) return text;
    }
  }
  if (input.workflowKey === COURSE_STATUS_CHANGED_WORKFLOW_KEY) {
    const status = input.data?.status;
    if (typeof status === "string") {
      const text = COURSE_STATUS_ACTION_TEXTS[status];
      if (text) return text;
    }
  }
  return notificationActionText(input.workflowKey);
}

const NOTIFICATION_ICON_TYPES: Record<string, NotificationIconType> = {
  [REFUND_REQUEST_RAISED_WORKFLOW_KEY]: "refund",
  [REFUND_REQUEST_DECIDED_WORKFLOW_KEY]: "refund",
  [LESSON_COMMENT_POSTED_WORKFLOW_KEY]: "comment",
  [COMMENT_REPLY_POSTED_WORKFLOW_KEY]: "reply",
  [COURSE_RATING_LEFT_WORKFLOW_KEY]: "star",
  [SEAT_CLAIMED_WORKFLOW_KEY]: "seat",
  [COURSE_STATUS_CHANGED_WORKFLOW_KEY]: "course",
  [NEW_LESSON_AVAILABLE_WORKFLOW_KEY]: "lesson",
};

const FALLBACK_ICON_TYPE: NotificationIconType = "bell";

export function notificationIconType(workflowKey: string): NotificationIconType {
  return NOTIFICATION_ICON_TYPES[workflowKey] ?? FALLBACK_ICON_TYPE;
}

function contextLineFrom(data: Record<string, unknown> | null): string | null {
  const courseTitle = data?.courseTitle;
  return typeof courseTitle === "string" ? courseTitle : null;
}

export function formatNotificationRow(input: NotificationRowInput): NotificationRow {
  return {
    id: input.id,
    // Read is the only state change a Notification ever undergoes; a row
    // without a read stamp is Unread, and those are the only two states.
    state: input.readAt === null ? "unread" : "read",
    actorName: input.actorName ?? "Someone",
    actorAvatarUrl: input.actorAvatarUrl,
    actionText: actionTextFrom(input),
    contextLine: contextLineFrom(input.data),
    iconType: notificationIconType(input.workflowKey),
    deepLink: notificationDeepLink(input.workflowKey, input.data),
    insertedAt: input.insertedAt,
  };
}

// ─── Relative time ───

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

export function formatRelativeTime(insertedAt: string, now: Date): string {
  const when = new Date(insertedAt).getTime();

  if (Number.isNaN(when)) return "";

  const elapsed = now.getTime() - when;

  if (elapsed < MINUTE_MS) return "just now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`;
  if (elapsed < WEEK_MS) return `${Math.floor(elapsed / DAY_MS)}d ago`;

  return `${MONTHS[new Date(when).getMonth()]} ${new Date(when).getDate()}`;
}
