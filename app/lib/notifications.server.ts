import { asc, eq } from "drizzle-orm";
import { courses, purchases, refunds, users, RefundStatus, UserRole } from "~/db/schema";
import type { Db } from "~/lib/refunds.server";
import type { UserIdentity, WorkflowTrigger } from "~/lib/knock.server";
import {
  REFUND_REQUEST_DECIDED_WORKFLOW_KEY,
  REFUND_REQUEST_RAISED_WORKFLOW_KEY,
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
