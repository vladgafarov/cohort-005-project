import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  buildCourseRatingLeftNotification,
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

describe("buildCourseRatingLeftNotification", () => {
  it("notifies the course's Instructor when a Student rates the course", () => {
    const notification = buildCourseRatingLeftNotification(
      db,
      base.course.id,
      base.user.id,
      4,
      NOW
    );

    expect(notification).not.toBeNull();
    expect(notification?.workflowKey).toBe("course-rating-left");
    expect(notification?.recipients).toEqual([
      {
        id: base.instructor.id,
        name: "Test Instructor",
        email: "instructor@example.com",
        avatarUrl: null,
      },
    ]);
  });

  it("never notifies the rater when the rater is the course's own Instructor", () => {
    const notification = buildCourseRatingLeftNotification(
      db,
      base.course.id,
      base.instructor.id,
      5,
      NOW
    );

    expect(notification).toBeNull();
  });

  it("carries the rater as the actor with the rating and the course as the context", () => {
    const rater = db
      .insert(schema.users)
      .values({
        name: "Rita Rater",
        email: "rita@example.com",
        role: UserRole.Student,
        avatarUrl: "https://cdn.example.com/rita.png",
      })
      .returning()
      .get();

    const notification = buildCourseRatingLeftNotification(
      db,
      base.course.id,
      rater.id,
      5,
      NOW
    );

    expect(notification?.actor).toEqual({
      id: rater.id,
      name: "Rita Rater",
      email: "rita@example.com",
      avatarUrl: "https://cdn.example.com/rita.png",
    });
    expect(notification?.data).toEqual({
      courseTitle: base.course.title,
      rating: 5,
    });
  });

  it("keeps the trigger data flat — scalar values only, safe for the compact feed", () => {
    const notification = buildCourseRatingLeftNotification(
      db,
      base.course.id,
      base.user.id,
      3,
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

  it("builds nothing for a course that does not exist", () => {
    const notification = buildCourseRatingLeftNotification(
      db,
      999999,
      base.user.id,
      4,
      NOW
    );

    expect(notification).toBeNull();
  });
});
