import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { RefundStatus, UserRole } from "~/db/schema";
import {
  approveRefundRequest,
  declineRefundRequest,
  raiseRefundRequest,
} from "~/lib/refunds.server";
import {
  buildRefundRequestDecidedNotification,
  buildRefundRequestRaisedNotification,
} from "./notifications.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function daysBefore(days: number) {
  const when = new Date(NOW);
  when.setDate(when.getDate() - days);
  return when.toISOString();
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

function addAdmin(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      role: UserRole.Admin,
    })
    .returning()
    .get();
}

function buyForSelf(userId: number) {
  return db
    .insert(schema.purchases)
    .values({
      userId,
      courseId: base.course.id,
      amountPaid: 7900,
      createdAt: daysBefore(3),
    })
    .returning()
    .get();
}

// The real raising flow, so a decided-request fixture starts from the
// exact rows the route produces.
function raiseOpenRequest(purchaseId: number, buyerId: number) {
  const raised = raiseRefundRequest(
    db,
    purchaseId,
    buyerId,
    "It was not what I expected.",
    NOW
  );
  if (!raised.ok) {
    throw new Error(`fixture could not raise the request: ${raised.error}`);
  }
  return raised;
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

describe("buildRefundRequestRaisedNotification", () => {
  it("notifies every Platform Admin", () => {
    const pat = addAdmin("Pat Admin");
    const robin = addAdmin("Robin Admin");
    const purchase = buyForSelf(base.user.id);

    const notification = buildRefundRequestRaisedNotification(
      db,
      purchase.id,
      base.user.id,
      "It was not what I expected.",
      NOW
    );

    expect(notification).not.toBeNull();
    expect(notification?.recipients).toEqual([
      { id: pat.id, name: "Pat Admin", email: pat.email, avatarUrl: null },
      { id: robin.id, name: "Robin Admin", email: robin.email, avatarUrl: null },
    ]);
    expect(notification?.workflowKey).toBe("refund-request-raised");
  });

  it("never notifies the buyer, even when the buyer is themselves a Platform Admin", () => {
    const pat = addAdmin("Pat Admin");
    const buyer = addAdmin("Bailey Admin-Buyer");
    const purchase = buyForSelf(buyer.id);

    const notification = buildRefundRequestRaisedNotification(
      db,
      purchase.id,
      buyer.id,
      "It was not what I expected.",
      NOW
    );

    expect(notification).not.toBeNull();
    expect(notification?.recipients.map((recipient) => recipient.id)).toEqual([
      pat.id,
    ]);
  });

  it("carries the buyer as the actor with the course and reason as the context", () => {
    addAdmin("Pat Admin");
    const buyer = db
      .insert(schema.users)
      .values({
        name: "Betty Buyer",
        email: "betty@example.com",
        role: UserRole.Student,
        avatarUrl: "https://cdn.example.com/betty.png",
      })
      .returning()
      .get();
    const purchase = buyForSelf(buyer.id);

    const notification = buildRefundRequestRaisedNotification(
      db,
      purchase.id,
      buyer.id,
      "It was not what I expected.",
      NOW
    );

    expect(notification?.actor).toEqual({
      id: buyer.id,
      name: "Betty Buyer",
      email: "betty@example.com",
      avatarUrl: "https://cdn.example.com/betty.png",
    });
    expect(notification?.data).toEqual({
      courseTitle: base.course.title,
      reason: "It was not what I expected.",
    });
  });

  it("keeps the trigger data flat — scalar values only, safe for the compact feed", () => {
    addAdmin("Pat Admin");
    const purchase = buyForSelf(base.user.id);

    const notification = buildRefundRequestRaisedNotification(
      db,
      purchase.id,
      base.user.id,
      "It was not what I expected.",
      NOW
    );

    const values = Object.values(notification?.data ?? {});
    expect(values.length).toBeGreaterThan(0);
    expect(
      values.every(
        (value) =>
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
      )
    ).toBe(true);
  });

  it("builds nothing when there is no Platform Admin to notify", () => {
    const purchase = buyForSelf(base.user.id);

    const notification = buildRefundRequestRaisedNotification(
      db,
      purchase.id,
      base.user.id,
      "It was not what I expected.",
      NOW
    );

    expect(notification).toBeNull();
  });

  it("builds nothing for a purchase that does not exist", () => {
    addAdmin("Pat Admin");

    const notification = buildRefundRequestRaisedNotification(
      db,
      999999,
      base.user.id,
      "It was not what I expected.",
      NOW
    );

    expect(notification).toBeNull();
  });
});

describe("buildRefundRequestDecidedNotification", () => {
  it("notifies the buyer, never the deciding Platform Admin, when the request is approved", () => {
    const pat = addAdmin("Pat Admin");
    const purchase = buyForSelf(base.user.id);
    const { refundRequestId } = raiseOpenRequest(purchase.id, base.user.id);
    const decision = approveRefundRequest(
      db,
      refundRequestId,
      pat.id,
      "Refunded in full.",
      NOW
    );
    if (!decision.ok) {
      throw new Error(`fixture could not approve the request: ${decision.error}`);
    }

    const notification = buildRefundRequestDecidedNotification(
      db,
      refundRequestId,
      pat.id,
      RefundStatus.Approved,
      "Refunded in full.",
      NOW
    );

    expect(notification).not.toBeNull();
    expect(notification?.recipients).toEqual([
      {
        id: base.user.id,
        name: "Test User",
        email: "test@example.com",
        avatarUrl: null,
      },
    ]);
    expect(notification?.actor).toEqual({
      id: pat.id,
      name: "Pat Admin",
      email: pat.email,
      avatarUrl: null,
    });
    expect(notification?.workflowKey).toBe("refund-request-decided");
    expect(notification?.data).toEqual({
      decision: "approved",
      note: "Refunded in full.",
      courseTitle: "Test Course",
      amountPaid: 7900,
    });
  });

  it("notifies the buyer, never the deciding Platform Admin, when the request is declined", () => {
    const pat = addAdmin("Pat Admin");
    const purchase = buyForSelf(base.user.id);
    const { refundRequestId } = raiseOpenRequest(purchase.id, base.user.id);
    const decision = declineRefundRequest(
      db,
      refundRequestId,
      pat.id,
      "You have completed most of the course.",
      NOW
    );
    if (!decision.ok) {
      throw new Error(`fixture could not decline the request: ${decision.error}`);
    }

    const notification = buildRefundRequestDecidedNotification(
      db,
      refundRequestId,
      pat.id,
      RefundStatus.Declined,
      "You have completed most of the course.",
      NOW
    );

    expect(notification).not.toBeNull();
    expect(notification?.recipients).toEqual([
      {
        id: base.user.id,
        name: "Test User",
        email: "test@example.com",
        avatarUrl: null,
      },
    ]);
    expect(notification?.actor).toEqual({
      id: pat.id,
      name: "Pat Admin",
      email: pat.email,
      avatarUrl: null,
    });
    expect(notification?.workflowKey).toBe("refund-request-decided");
    expect(notification?.data).toEqual({
      decision: "declined",
      note: "You have completed most of the course.",
      courseTitle: "Test Course",
      amountPaid: 7900,
    });
  });

  it("never notifies the deciding Platform Admin when they are themselves the buyer", () => {
    const bailey = addAdmin("Bailey Admin-Buyer");
    const purchase = buyForSelf(bailey.id);
    const { refundRequestId } = raiseOpenRequest(purchase.id, bailey.id);
    const decision = approveRefundRequest(db, refundRequestId, bailey.id, null, NOW);
    if (!decision.ok) {
      throw new Error(`fixture could not approve the request: ${decision.error}`);
    }

    const notification = buildRefundRequestDecidedNotification(
      db,
      refundRequestId,
      bailey.id,
      RefundStatus.Approved,
      null,
      NOW
    );

    expect(notification).toBeNull();
  });

  it("keeps the trigger data flat — scalars only, safe for the compact feed", () => {
    const pat = addAdmin("Pat Admin");
    const purchase = buyForSelf(base.user.id);
    const { refundRequestId } = raiseOpenRequest(purchase.id, base.user.id);
    const decision = approveRefundRequest(db, refundRequestId, pat.id, null, NOW);
    if (!decision.ok) {
      throw new Error(`fixture could not approve the request: ${decision.error}`);
    }

    const notification = buildRefundRequestDecidedNotification(
      db,
      refundRequestId,
      pat.id,
      RefundStatus.Approved,
      null,
      NOW
    );

    // An approval needs no note; the absent note travels as null, not as a
    // nested shape.
    expect(notification?.data.note).toBeNull();
    const values = Object.values(notification?.data ?? {});
    expect(values.length).toBeGreaterThan(0);
    expect(
      values.every(
        (value) =>
          value === null ||
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
      )
    ).toBe(true);
  });

  it("builds nothing for a refund request that does not exist", () => {
    const pat = addAdmin("Pat Admin");

    const notification = buildRefundRequestDecidedNotification(
      db,
      999999,
      pat.id,
      RefundStatus.Approved,
      "Refunded in full.",
      NOW
    );

    expect(notification).toBeNull();
  });
});
