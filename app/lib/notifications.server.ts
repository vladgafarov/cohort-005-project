import { asc, eq } from "drizzle-orm";
import {
  comments,
  coupons,
  courses,
  lessons,
  modules,
  purchases,
  refunds,
  users,
  CourseStatus,
  RefundStatus,
  UserRole,
} from "~/db/schema";
import type { Db } from "~/lib/refunds.server";
import type { UserIdentity, WorkflowTrigger } from "~/lib/knock.server";
import {
  COMMENT_REPLY_POSTED_WORKFLOW_KEY,
  COURSE_RATING_LEFT_WORKFLOW_KEY,
  COURSE_STATUS_CHANGED_WORKFLOW_KEY,
  LESSON_COMMENT_POSTED_WORKFLOW_KEY,
  REFUND_REQUEST_DECIDED_WORKFLOW_KEY,
  REFUND_REQUEST_RAISED_WORKFLOW_KEY,
  SEAT_CLAIMED_WORKFLOW_KEY,
} from "~/lib/notification-rows";

// ─── Notification payload builders ───
// One pure, db-first builder per catalog Event: it reads the database to
// decide who is notified and what the Notification carries, and returns a
// WorkflowTrigger for the Knock wrapper (app/lib/knock.server.ts) to fire.
// The suite of builders is the catalog's executable spec — recipients,
// actor, and context are pinned by tests, never left living in route code.
//
// Every builder takes the database first and `now` last, the refund domain's
// house convention, so call sites read alike; this Event has no time
// eligibility of its own, so `now` is held for catalog uniformity.
//
// The builder never sends anything and never throws: when the database
// cannot support a Notification — the rows are gone, or there is no one to
// notify — it returns null, and the calling action loses the Notification
// silently, exactly as a failed trigger would.

function identityOf(user: typeof users.$inferSelect): UserIdentity {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

// The course a lesson belongs to, with the lesson's own title: the context
// every comment Event carries — which course, which lesson, and (through
// instructorId) who to notify about a fresh comment.
function courseOfLesson(db: Db, lessonId: number) {
  return db
    .select({
      instructorId: courses.instructorId,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      lessonTitle: lessons.title,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .get();
}

/**
 * "Refund Request raised": a buyer has just raised a Refund Request, and
 * every Platform Admin hears about it. The buyer is the actor — never a
 * recipient — and the Notification carries the course and the reason.
 */
export function buildRefundRequestRaisedNotification(
  db: Db,
  purchaseId: number,
  buyerId: number,
  reason: string,
  now: Date
): WorkflowTrigger | null {
  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .get();

  if (!purchase || purchase.userId !== buyerId) return null;

  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, purchase.courseId))
    .get();
  const buyer = db
    .select()
    .from(users)
    .where(eq(users.id, buyerId))
    .get();

  if (!course || !buyer) return null;

  // Recipients are decided by data, not role checks in the action: every
  // Platform Admin, minus the actor — the actor never receives the
  // Notification for their own action.
  const admins = db
    .select()
    .from(users)
    .where(eq(users.role, UserRole.Admin))
    .orderBy(asc(users.id))
    .all()
    .filter((admin) => admin.id !== buyer.id);

  if (admins.length === 0) return null;

  return {
    workflowKey: REFUND_REQUEST_RAISED_WORKFLOW_KEY,
    recipients: admins.map(identityOf),
    actor: identityOf(buyer),
    // Flat scalars only: the feed's compact mode strips nested arrays and
    // objects out of item data.
    data: {
      courseTitle: course.title,
      reason,
    },
  };
}

/**
 * "Refund Request decided": a Platform Admin has just approved or declined
 * an Open Refund Request, and the buyer hears about it alongside the email
 * they already receive — the deliberate dual touch, the email staying the
 * only email. The deciding Platform Admin is the actor, never a recipient,
 * and the Notification carries the decision, the admin's note, the course,
 * and the amount, so the buyer can read the outcome in their feed and
 * follow the link to their refund history, where the note lives.
 */
export function buildRefundRequestDecidedNotification(
  db: Db,
  refundRequestId: number,
  platformAdminId: number,
  decision: RefundStatus.Approved | RefundStatus.Declined,
  note: string | null,
  now: Date
): WorkflowTrigger | null {
  const refundRequest = db
    .select()
    .from(refunds)
    .where(eq(refunds.id, refundRequestId))
    .get();

  if (!refundRequest) return null;

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, refundRequest.purchaseId))
    .get();

  if (!purchase) return null;

  const buyer = db
    .select()
    .from(users)
    .where(eq(users.id, purchase.userId))
    .get();
  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, purchase.courseId))
    .get();
  const admin = db
    .select()
    .from(users)
    .where(eq(users.id, platformAdminId))
    .get();

  if (!buyer || !course || !admin) return null;

  // The standing rule: the actor never receives the Notification for
  // their own action. A Platform Admin deciding their own Refund Request
  // is both buyer and actor, so there is no one to notify.
  if (buyer.id === admin.id) return null;

  return {
    workflowKey: REFUND_REQUEST_DECIDED_WORKFLOW_KEY,
    recipients: [identityOf(buyer)],
    actor: identityOf(admin),
    // Flat scalars only: the feed's compact mode strips nested arrays and
    // objects out of item data. The note is null when the admin did not
    // write one — an approval needs no note.
    data: {
      decision,
      note,
      courseTitle: course.title,
      amountPaid: purchase.amountPaid,
    },
  };
}

/**
 * "Comment posted on a lesson": a Student has just commented on a lesson,
 * and the course's Instructor hears about it while it's fresh. The
 * commenter is the actor — never a recipient, even when the commenter is
 * the Instructor themself — and the Notification carries the course and
 * the lesson, so the row can deep-link straight into the Instructor's
 * Q&A queue.
 */
export function buildLessonCommentPostedNotification(
  db: Db,
  commentId: number,
  now: Date
): WorkflowTrigger | null {
  const comment = db
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .get();

  // A reply is the comment-reply Event's insert shape, not this one's: the
  // comment Event fires on top-level comments only.
  if (!comment || comment.parentId !== null) return null;

  const context = courseOfLesson(db, comment.lessonId);
  const actor = db
    .select()
    .from(users)
    .where(eq(users.id, comment.userId))
    .get();
  const instructor = context
    ? db
        .select()
        .from(users)
        .where(eq(users.id, context.instructorId))
        .get()
    : undefined;

  if (!context || !actor || !instructor) return null;

  // The standing rule: the actor never receives the Notification for their
  // own action. The Instructor commenting on their own lesson is actor and
  // recipient in one, so there is no one to notify.
  if (actor.id === instructor.id) return null;

  return {
    workflowKey: LESSON_COMMENT_POSTED_WORKFLOW_KEY,
    recipients: [identityOf(instructor)],
    actor: identityOf(actor),
    // Flat scalars only: the feed's compact mode strips nested arrays and
    // objects out of item data.
    data: {
      courseTitle: context.courseTitle,
      lessonTitle: context.lessonTitle,
    },
  };
}

/**
 * "Comment reply posted": someone has just replied to a comment, and the
 * comment's author hears about it. An Instructor's Q&A answer is one of
 * these — answering in the queue inserts a reply — so the Student who
 * asked gets the row and can keep the conversation going without
 * patrolling the lesson. The replier is the actor, never a recipient, and
 * the Notification carries the course and the lesson thread it happened
 * in, so the row deep-links straight into that thread.
 */
export function buildCommentReplyPostedNotification(
  db: Db,
  replyId: number,
  now: Date
): WorkflowTrigger | null {
  const reply = db
    .select()
    .from(comments)
    .where(eq(comments.id, replyId))
    .get();

  // A top-level comment is the lesson-comment Event's insert shape, not
  // this one's: the reply Event fires on replies only.
  if (!reply || reply.parentId === null) return null;

  const parent = db
    .select()
    .from(comments)
    .where(eq(comments.id, reply.parentId))
    .get();
  const context = courseOfLesson(db, reply.lessonId);
  const actor = db
    .select()
    .from(users)
    .where(eq(users.id, reply.userId))
    .get();
  const parentAuthor = parent
    ? db
        .select()
        .from(users)
        .where(eq(users.id, parent.userId))
        .get()
    : undefined;

  if (!parent || !context || !actor || !parentAuthor) return null;

  // The standing rule: the actor never receives the Notification for
  // their own action. Replying to your own comment is its own confirmation.
  if (actor.id === parentAuthor.id) return null;

  return {
    workflowKey: COMMENT_REPLY_POSTED_WORKFLOW_KEY,
    recipients: [identityOf(parentAuthor)],
    actor: identityOf(actor),
    // Flat scalars only: the feed's compact mode strips nested arrays and
    // objects out of item data. courseSlug and lessonId are the pair the
    // row's deep link reads to land in the lesson thread.
    data: {
      courseTitle: context.courseTitle,
      courseSlug: context.courseSlug,
      lessonId: reply.lessonId,
      lessonTitle: context.lessonTitle,
    },
  };
}

/**
 * "Course rating left": a Student has just left a rating on the course
 * page, and the course's Instructor hears about it. The rater is the
 * actor — never a recipient — and the Notification carries the rating and
 * the course, so the Instructor sees how the course is being received.
 */
export function buildCourseRatingLeftNotification(
  db: Db,
  courseId: number,
  raterId: number,
  rating: number,
  now: Date
): WorkflowTrigger | null {
  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  const rater = db.select().from(users).where(eq(users.id, raterId)).get();
  const instructor = db
    .select()
    .from(users)
    .where(eq(users.id, course?.instructorId ?? -1))
    .get();

  if (!course || !rater || !instructor) return null;

  // The actor never receives the Notification for their own action — the
  // screen they are already on is their confirmation.
  if (instructor.id === rater.id) return null;

  return {
    workflowKey: COURSE_RATING_LEFT_WORKFLOW_KEY,
    recipients: [identityOf(instructor)],
    actor: identityOf(rater),
    // Flat scalars only: the feed's compact mode strips nested arrays and
    // objects out of item data.
    data: {
      courseTitle: course.title,
      rating,
    },
  };
}

/**
 * "Seat claimed": someone has just claimed a Seat on the redeem page, and
 * the Team Admin who bought that Team Licence hears about it. The buyer is
 * resolved through the Seat's Purchase — data, not a role label — so the
 * redeem action passes only the identifiers it holds (the code and the
 * claimer), and this builder re-derives the rest from the database. The
 * claimer is the actor and never the recipient: a Team Licence grants its
 * buyer no Enrollment, so a buyer can claim one of their own Seats, and
 * that claim notifies nobody.
 */
export function buildSeatClaimedNotification(
  db: Db,
  code: string,
  claimerId: number,
  now: Date
): WorkflowTrigger | null {
  const seat = db.select().from(coupons).where(eq(coupons.code, code)).get();
  if (!seat) return null;

  // The Seat's Purchase is the only path to the recipient: its buyer is
  // the Team Admin who bought the Team Licence.
  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();
  if (!purchase) return null;

  // The claimer must be the one who redeemed this Seat — the builder
  // runs after the claim and re-derives, never trusting the caller.
  if (seat.redeemedByUserId !== claimerId) return null;

  const buyer = db
    .select()
    .from(users)
    .where(eq(users.id, purchase.userId))
    .get();
  const claimer = db
    .select()
    .from(users)
    .where(eq(users.id, claimerId))
    .get();
  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, seat.courseId))
    .get();

  if (!buyer || !claimer || !course) return null;

  // The standing rule: the actor never receives the Notification for
  // their own action.
  if (buyer.id === claimer.id) return null;

  return {
    workflowKey: SEAT_CLAIMED_WORKFLOW_KEY,
    recipients: [identityOf(buyer)],
    actor: identityOf(claimer),
    // Flat scalars only: the feed's compact mode strips nested arrays and
    // objects out of item data.
    data: {
      courseTitle: course.title,
      claimerName: claimer.name,
    },
  };
}

/**
 * "Course published / archived": a Platform Admin has just moved a course
 * into Published or Archived in the admin course screens, and the course's
 * Instructor hears about it without going to look for it. The admin is the
 * actor — never a recipient — and the Notification carries the transition
 * and the course it concerns, so the row deep-links to the Instructor's
 * course home, where the status shows.
 */
export function buildCourseStatusChangedNotification(
  db: Db,
  courseId: number,
  fromStatus: CourseStatus,
  toStatus: CourseStatus,
  actorId: number,
  now: Date
): WorkflowTrigger | null {
  // The gate: the Event fires only on a real transition that lands the
  // course in Published or Archived — a landing in Draft is bookkeeping,
  // not news, and re-picking the status the course already has is not a
  // transition at all.
  if (
    (toStatus !== CourseStatus.Published &&
      toStatus !== CourseStatus.Archived) ||
    fromStatus === toStatus
  ) {
    return null;
  }

  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  const actor = db.select().from(users).where(eq(users.id, actorId)).get();
  const instructor = db
    .select()
    .from(users)
    .where(eq(users.id, course?.instructorId ?? -1))
    .get();

  if (!course || !actor || !instructor) return null;

  // The standing rule: the actor never receives the Notification for
  // their own action. A Platform Admin who also teaches the course is
  // actor and recipient in one — the screen they are already on is their
  // confirmation.
  if (instructor.id === actor.id) return null;

  return {
    workflowKey: COURSE_STATUS_CHANGED_WORKFLOW_KEY,
    recipients: [identityOf(instructor)],
    actor: identityOf(actor),
    // Flat scalars only: the feed's compact mode strips nested arrays and
    // objects out of item data. courseId is what the row's deep link reads
    // to land on the Instructor's course home; status repeats the landing
    // status under the name the workflow's dashboard body templates it by
    // (docs/notifications-workflows.md).
    data: {
      courseId: course.id,
      courseTitle: course.title,
      fromStatus,
      toStatus,
      status: toStatus,
    },
  };
}
