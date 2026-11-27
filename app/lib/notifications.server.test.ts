import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  buildRefundRequestRaisedNotification,
  buildSeatClaimedNotification,
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

describe("buildSeatClaimedNotification", () => {
  // A buyer of a Team Licence — resolved through the Seat's Purchase, data
  // and not a role label: the seeded Team Admins hold the Student role.
  function addUser(name: string, email: string, avatarUrl: string | null = null) {
    return db
      .insert(schema.users)
      .values({ name, email, role: UserRole.Student, avatarUrl })
      .returning()
      .get();
  }

  function buyTeamLicence(buyerId: number) {
    const team = db.insert(schema.teams).values({}).returning().get();
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: buyerId,
        courseId: base.course.id,
        amountPaid: 39500,
        createdAt: daysBefore(3),
      })
      .returning()
      .get();
    const seat = db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: "TEAM-TEST-01",
        purchaseId: purchase.id,
      })
      .returning()
      .get();
    return { team, purchase, seat };
  }

  function claimSeat(seatId: number, claimerId: number) {
    db.update(schema.coupons)
      .set({ redeemedByUserId: claimerId, redeemedAt: daysBefore(0) })
      .where(eq(schema.coupons.id, seatId))
      .run();
  }

  it("notifies the buyer of the Seat's Purchase, never the claimer", () => {
    const buyer = addUser("Bossy Buyer", "bossy@example.com");
    const claimer = addUser("Casey Claimer", "casey@example.com");
    const { seat } = buyTeamLicence(buyer.id);
    claimSeat(seat.id, claimer.id);

    const notification = buildSeatClaimedNotification(
      db,
      seat.code,
      claimer.id,
      NOW
    );

    expect(notification).not.toBeNull();
    expect(notification?.recipients).toEqual([
      {
        id: buyer.id,
        name: "Bossy Buyer",
        email: "bossy@example.com",
        avatarUrl: null,
      },
    ]);
    expect(
      notification?.recipients.map((recipient) => recipient.id)
    ).not.toContain(claimer.id);
    expect(notification?.workflowKey).toBe("seat-claimed");
  });

  it("carries the claimer as the actor with the course title and the claimer's name", () => {
    const buyer = addUser("Bossy Buyer", "bossy@example.com");
    const claimer = addUser(
      "Casey Claimer",
      "casey@example.com",
      "https://cdn.example.com/casey.png"
    );
    const { seat } = buyTeamLicence(buyer.id);
    claimSeat(seat.id, claimer.id);

    const notification = buildSeatClaimedNotification(
      db,
      seat.code,
      claimer.id,
      NOW
    );

    expect(notification?.actor).toEqual({
      id: claimer.id,
      name: "Casey Claimer",
      email: "casey@example.com",
      avatarUrl: "https://cdn.example.com/casey.png",
    });
    expect(notification?.data).toEqual({
      courseTitle: base.course.title,
      claimerName: "Casey Claimer",
    });
  });

  it("builds nothing when the buyer claims their own Seat", () => {
    const buyer = addUser("Bossy Buyer", "bossy@example.com");
    const { seat } = buyTeamLicence(buyer.id);
    claimSeat(seat.id, buyer.id);

    const notification = buildSeatClaimedNotification(
      db,
      seat.code,
      buyer.id,
      NOW
    );

    expect(notification).toBeNull();
  });

  it("builds nothing for a code that is not a Seat", () => {
    const claimer = addUser("Casey Claimer", "casey@example.com");

    const notification = buildSeatClaimedNotification(
      db,
      "NO-SUCH-SEAT",
      claimer.id,
      NOW
    );

    expect(notification).toBeNull();
  });
});
