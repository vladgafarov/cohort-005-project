import { asc, eq } from "drizzle-orm";
import { coupons, courses, purchases, users, UserRole } from "~/db/schema";
import type { Db } from "~/lib/refunds.server";
import type { UserIdentity, WorkflowTrigger } from "~/lib/knock.server";
import {
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
