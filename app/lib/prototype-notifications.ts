// PROTOTYPE (wayfinder #6 — https://github.com/vladgafarov/cohort-005-project/issues/6)
// Throwaway fixture data for the notification-center UX prototype. Never merge.
//
// Rows are fixtures, not Knock data: this prototype answers "what does the
// surface look like", not "does the backend work". The events themselves come
// from the Event catalog decision (#4) — actor ≠ recipient, nine events — and
// the single Channel (in-app feed) from the Infra & channels decision (#5).
// Time labels are static strings so SSR and hydration render identically.

import {
  Archive,
  CircleCheck,
  GraduationCap,
  MessageSquare,
  Receipt,
  Reply,
  Star,
  UserCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { UserRole } from "~/db/schema";

export type PrototypeEventType =
  | "refund-raised"
  | "refund-decided"
  | "lesson-comment"
  | "comment-reply"
  | "course-rating"
  | "seat-claimed"
  | "course-status"
  | "new-lesson"
  | "role-changed";

export interface PrototypeEventMeta {
  icon: LucideIcon;
  label: string;
  prefsLabel: string;
  prefsDescription: string;
}

export const PROTOTYPE_EVENT_META: Record<PrototypeEventType, PrototypeEventMeta> = {
  "refund-raised": {
    icon: Receipt,
    label: "Refund Request raised",
    prefsLabel: "New refund requests",
    prefsDescription: "Someone raises a Refund Request waiting on a Platform Admin.",
  },
  "refund-decided": {
    icon: CircleCheck,
    label: "Refund Request decided",
    prefsLabel: "Refund decisions",
    prefsDescription: "A Platform Admin approves or declines your Refund Request.",
  },
  "lesson-comment": {
    icon: MessageSquare,
    label: "Lesson comment",
    prefsLabel: "Comments on my lessons",
    prefsDescription: "A Student posts a comment or question on a lesson I own.",
  },
  "comment-reply": {
    icon: Reply,
    label: "Comment reply",
    prefsLabel: "Replies to my comments",
    prefsDescription: "Someone replies to a comment I wrote.",
  },
  "course-rating": {
    icon: Star,
    label: "Course rating",
    prefsLabel: "Ratings on my courses",
    prefsDescription: "A Student leaves a rating on one of my courses.",
  },
  "seat-claimed": {
    icon: UsersRound,
    label: "Seat claimed",
    prefsLabel: "Seats claimed",
    prefsDescription: "A Student claims a Seat on a Team Licence I bought.",
  },
  "course-status": {
    icon: Archive,
    label: "Course published / archived",
    prefsLabel: "Publish & archive changes",
    prefsDescription: "A Platform Admin publishes or archives one of my courses.",
  },
  "new-lesson": {
    icon: GraduationCap,
    label: "New lesson available",
    prefsLabel: "New lessons",
    prefsDescription: "A lesson on a course I'm enrolled in gets its first content.",
  },
  "role-changed": {
    icon: UserCog,
    label: "Role changed",
    prefsLabel: "Account role changes",
    prefsDescription: "A Platform Admin changes my role.",
  },
};

export interface PrototypeNotification {
  id: string;
  eventType: PrototypeEventType;
  actorName: string;
  actorAvatarUrl: string | null;
  /** Action text after the actor name, e.g. "asked a question on “Generics Basics”". */
  text: string;
  /** Course or purchase context shown under the action. */
  context: string;
  deepLink: string;
  timeLabel: string;
  bucket: "today" | "earlier";
  read: boolean;
}

// Seed-plausible rows per role. Names, course titles and lesson links match
// scripts/seed.ts so the deep links land on real pages.
const PLATFORM_ADMIN_ROWS: PrototypeNotification[] = [
  {
    id: "a1",
    eventType: "refund-raised",
    actorName: "Liam Thompson",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=liam",
    text: "requested a refund",
    context: "Building REST APIs with Node.js",
    deepLink: "/admin/refunds",
    timeLabel: "12m ago",
    bucket: "today",
    read: false,
  },
  {
    id: "a2",
    eventType: "refund-raised",
    actorName: "Bossy McBossface",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=bossy",
    text: "requested a refund on a Team Licence",
    context: "Building REST APIs with Node.js",
    deepLink: "/admin/refunds",
    timeLabel: "3h ago",
    bucket: "today",
    read: false,
  },
  {
    id: "a3",
    eventType: "refund-raised",
    actorName: "Sophia Davis",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=sophia",
    text: "requested a refund",
    context: "Introduction to TypeScript",
    deepLink: "/admin/refunds",
    timeLabel: "yesterday",
    bucket: "earlier",
    read: true,
  },
  {
    id: "a4",
    eventType: "refund-raised",
    actorName: "Ava Nakamura",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=ava-nakamura",
    text: "requested a refund",
    context: "Design Systems with Tailwind",
    deepLink: "/admin/refunds",
    timeLabel: "2d ago",
    bucket: "earlier",
    read: true,
  },
];

const INSTRUCTOR_ROWS: PrototypeNotification[] = [
  {
    id: "i1",
    eventType: "lesson-comment",
    actorName: "Emma Wilson",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=emma",
    text: "asked a question on “Your First TypeScript Program”",
    context: "Introduction to TypeScript",
    deepLink: "/instructor/questions",
    timeLabel: "25m ago",
    bucket: "today",
    read: false,
  },
  {
    id: "i2",
    eventType: "lesson-comment",
    actorName: "Sophia Davis",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=sophia",
    text: "asked a question on “Arrays and Tuples”",
    context: "Introduction to TypeScript",
    deepLink: "/instructor/questions",
    timeLabel: "4h ago",
    bucket: "today",
    read: false,
  },
  {
    id: "i3",
    eventType: "comment-reply",
    actorName: "James Park",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=james",
    text: "replied to your comment on “What is TypeScript?”",
    context: "Introduction to TypeScript",
    deepLink: "/courses/introduction-to-typescript/lessons/1",
    timeLabel: "2h ago",
    bucket: "today",
    read: false,
  },
  {
    id: "i4",
    eventType: "course-rating",
    actorName: "Olivia Martinez",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=olivia",
    text: "rated your course ★★★★",
    context: "Introduction to TypeScript",
    deepLink: "/instructor/analytics",
    timeLabel: "yesterday",
    bucket: "earlier",
    read: true,
  },
  {
    id: "i5",
    eventType: "course-status",
    actorName: "Alex Rivera",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=alex",
    text: "archived your course",
    context: "Design Systems with Tailwind",
    deepLink: "/instructor",
    timeLabel: "2d ago",
    bucket: "earlier",
    read: true,
  },
  {
    id: "i6",
    eventType: "role-changed",
    actorName: "Alex Rivera",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=alex",
    text: "changed your role to Instructor",
    context: "",
    deepLink: "/settings",
    timeLabel: "5d ago",
    bucket: "earlier",
    read: true,
  },
];

const STUDENT_ROWS: PrototypeNotification[] = [
  {
    id: "s1",
    eventType: "new-lesson",
    actorName: "Sarah Chen",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=sarah",
    text: "published a new lesson “Mapped Types”",
    context: "Introduction to TypeScript",
    deepLink: "/courses/introduction-to-typescript/lessons/14",
    timeLabel: "1h ago",
    bucket: "today",
    read: false,
  },
  {
    id: "s2",
    eventType: "refund-decided",
    actorName: "Alex Rivera",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=alex",
    text: "declined your refund request",
    context: "Building REST APIs with Node.js",
    deepLink: "/settings",
    timeLabel: "3h ago",
    bucket: "today",
    read: false,
  },
  {
    id: "s3",
    eventType: "comment-reply",
    actorName: "Sarah Chen",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=sarah",
    text: "replied to your comment on “Your First TypeScript Program”",
    context: "Introduction to TypeScript",
    deepLink: "/courses/introduction-to-typescript/lessons/3",
    timeLabel: "yesterday",
    bucket: "earlier",
    read: true,
  },
  {
    id: "s4",
    eventType: "refund-decided",
    actorName: "Alex Rivera",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=alex",
    text: "approved your refund request",
    context: "Design Systems with Tailwind",
    deepLink: "/settings",
    timeLabel: "2d ago",
    bucket: "earlier",
    read: true,
  },
];

// A Team Licence grants Seats, not an Enrollment (GLOSSARY.md) — so the Team
// Admin's feed is seat claims and purchase decisions, never "new lesson".
const TEAM_ADMIN_ROWS: PrototypeNotification[] = [
  {
    id: "t1",
    eventType: "seat-claimed",
    actorName: "Olivia Martinez",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=olivia",
    text: "claimed a seat on your Team Licence",
    context: "Building REST APIs with Node.js",
    deepLink: "/team",
    timeLabel: "30m ago",
    bucket: "today",
    read: false,
  },
  {
    id: "t2",
    eventType: "seat-claimed",
    actorName: "Liam Thompson",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=liam",
    text: "claimed a seat on your Team Licence",
    context: "Building REST APIs with Node.js",
    deepLink: "/team",
    timeLabel: "yesterday",
    bucket: "earlier",
    read: true,
  },
  {
    id: "t3",
    eventType: "seat-claimed",
    actorName: "Zara Haddad",
    actorAvatarUrl: "https://api.dicebear.com/9.x/avataaars/svg?seed=zara-haddad",
    text: "claimed a seat on your Team Licence",
    context: "Building REST APIs with Node.js",
    deepLink: "/team",
    timeLabel: "3d ago",
    bucket: "earlier",
    read: true,
  },
];

export function prototypeNotificationsFor(
  role: UserRole | null,
  isTeamAdmin: boolean
): PrototypeNotification[] {
  if (!role) return [];
  if (isTeamAdmin) return TEAM_ADMIN_ROWS;
  if (role === UserRole.Admin) return PLATFORM_ADMIN_ROWS;
  if (role === UserRole.Instructor) return INSTRUCTOR_ROWS;
  return STUDENT_ROWS;
}

export interface PrototypePref {
  key: PrototypeEventType;
  label: string;
  description: string;
}

export function prototypePrefsFor(
  role: UserRole | null,
  isTeamAdmin: boolean
): PrototypePref[] {
  const keys: PrototypeEventType[] = isTeamAdmin
    ? ["seat-claimed"]
    : role === UserRole.Admin
      ? ["refund-raised"]
      : role === UserRole.Instructor
        ? [
            "lesson-comment",
            "comment-reply",
            "course-rating",
            "course-status",
            "role-changed",
          ]
        : ["new-lesson", "comment-reply", "refund-decided", "role-changed"];

  return keys.map((key) => ({
    key,
    label: PROTOTYPE_EVENT_META[key].prefsLabel,
    description: PROTOTYPE_EVENT_META[key].prefsDescription,
  }));
}
