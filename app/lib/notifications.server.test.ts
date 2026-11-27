import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, RefundStatus, UserRole } from "~/db/schema";
import {
  approveRefundRequest,
  declineRefundRequest,
  raiseRefundRequest,
} from "~/lib/refunds.server";
import {
  buildCommentReplyPostedNotification,
  buildCourseRatingLeftNotification,
  buildCourseStatusChangedNotification,
  buildLessonCommentPostedNotification,
  buildRefundRequestDecidedNotification,
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

// The lesson the comment Events hang off: one module, one lesson on the
// seeded course.
function addLesson(title: string) {
  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Module 1", position: 1 })
    .returning()
    .get();
  return db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title, position: 1 })
    .returning()
    .get();
}

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

// The insert shape both comment routes write — the lesson page's comment
// form and the Q&A queue's reply form duplicate the insert logic, so the
// fixture mirrors it: parentId null for a top-level comment, set for a
// reply.
function addComment(
  userId: number,
  lessonId: number,
  parentId: number | null,
  body: string
) {
  return db
    .insert(schema.comments)
    .values({ userId, lessonId, parentId, body })
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

describe("buildLessonCommentPostedNotification", () => {
  it("notifies the course's Instructor when a Student comments on their lesson", () => {
    const lesson = addLesson("Union Narrowing");
    const comment = addComment(
      base.user.id,
      lesson.id,
      null,
      "How do unions narrow?"
    );

    const notification = buildLessonCommentPostedNotification(
      db,
      comment.id,
      NOW
    );

    expect(notification?.workflowKey).toBe("lesson-comment-posted");
    expect(notification?.recipients).toEqual([
      {
        id: base.instructor.id,
        name: "Test Instructor",
        email: "instructor@example.com",
        avatarUrl: null,
      },
    ]);
    expect(notification?.actor).toEqual({
      id: base.user.id,
      name: "Test User",
      email: "test@example.com",
      avatarUrl: null,
    });
  });

  it("never notifies the commenter when the Instructor comments on their own lesson", () => {
    const lesson = addLesson("Union Narrowing");
    const comment = addComment(
      base.instructor.id,
      lesson.id,
      null,
      "A note on generics."
    );

    const notification = buildLessonCommentPostedNotification(
      db,
      comment.id,
      NOW
    );

    expect(notification).toBeNull();
  });

  it("carries the course and the lesson as the context", () => {
    const lesson = addLesson("Union Narrowing");
    const comment = addComment(
      base.user.id,
      lesson.id,
      null,
      "How do unions narrow?"
    );

    const notification = buildLessonCommentPostedNotification(
      db,
      comment.id,
      NOW
    );

    expect(notification?.data).toEqual({
      courseTitle: base.course.title,
      lessonTitle: lesson.title,
    });
  });

  it("keeps the trigger data flat — scalar values only, safe for the compact feed", () => {
    const lesson = addLesson("Union Narrowing");
    const comment = addComment(
      base.user.id,
      lesson.id,
      null,
      "How do unions narrow?"
    );

    const notification = buildLessonCommentPostedNotification(
      db,
      comment.id,
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

  it("builds nothing for a reply — a reply is the comment-reply Event's insert shape", () => {
    const lesson = addLesson("Union Narrowing");
    const question = addComment(
      base.user.id,
      lesson.id,
      null,
      "How do unions narrow?"
    );
    const reply = addComment(
      base.instructor.id,
      lesson.id,
      question.id,
      "Narrowing happens at the branch."
    );

    const notification = buildLessonCommentPostedNotification(
      db,
      reply.id,
      NOW
    );

    expect(notification).toBeNull();
  });

  it("builds nothing for a comment that does not exist", () => {
    const notification = buildLessonCommentPostedNotification(
      db,
      999999,
      NOW
    );

    expect(notification).toBeNull();
  });
});

describe("buildCommentReplyPostedNotification", () => {
  it("notifies the parent comment's author when someone replies to it", () => {
    const lesson = addLesson("Union Narrowing");
    const question = addComment(
      base.user.id,
      lesson.id,
      null,
      "How do unions narrow?"
    );
    const rio = addStudent("Rio Student");
    const reply = addComment(
      rio.id,
      lesson.id,
      question.id,
      "Same question here."
    );

    const notification = buildCommentReplyPostedNotification(
      db,
      reply.id,
      NOW
    );

    expect(notification?.workflowKey).toBe("comment-reply-posted");
    expect(notification?.recipients).toEqual([
      {
        id: base.user.id,
        name: "Test User",
        email: "test@example.com",
        avatarUrl: null,
      },
    ]);
    expect(notification?.actor).toEqual({
      id: rio.id,
      name: "Rio Student",
      email: rio.email,
      avatarUrl: null,
    });
  });

  it("notifies the Student who asked when the Instructor answers in the Q&A queue", () => {
    const lesson = addLesson("Union Narrowing");
    const question = addComment(
      base.user.id,
      lesson.id,
      null,
      "How do unions narrow?"
    );
    // The Q&A queue's answer is a reply to the question, so the question's
    // author — the parent-comment author — is the one to notify.
    const answer = addComment(
      base.instructor.id,
      lesson.id,
      question.id,
      "Narrowing happens at the branch."
    );

    const notification = buildCommentReplyPostedNotification(
      db,
      answer.id,
      NOW
    );

    expect(notification?.recipients.map((recipient) => recipient.id)).toEqual([
      base.user.id,
    ]);
    expect(notification?.actor.id).toBe(base.instructor.id);
  });

  it("never notifies the replier when they reply to their own comment", () => {
    const lesson = addLesson("Union Narrowing");
    const question = addComment(
      base.user.id,
      lesson.id,
      null,
      "How do unions narrow?"
    );
    const reply = addComment(
      base.user.id,
      lesson.id,
      question.id,
      "Follow-up: and for objects?"
    );

    const notification = buildCommentReplyPostedNotification(
      db,
      reply.id,
      NOW
    );

    expect(notification).toBeNull();
  });

  it("builds nothing for a top-level comment — a top-level comment is the lesson-comment Event's insert shape", () => {
    const lesson = addLesson("Union Narrowing");
    const comment = addComment(
      base.user.id,
      lesson.id,
      null,
      "How do unions narrow?"
    );

    const notification = buildCommentReplyPostedNotification(
      db,
      comment.id,
      NOW
    );

    expect(notification).toBeNull();
  });

  it("carries the course, the lesson and the thread as the context", () => {
    const lesson = addLesson("Union Narrowing");
    const question = addComment(
      base.user.id,
      lesson.id,
      null,
      "How do unions narrow?"
    );
    const rio = addStudent("Rio Student");
    const reply = addComment(
      rio.id,
      lesson.id,
      question.id,
      "Same question here."
    );

    const notification = buildCommentReplyPostedNotification(
      db,
      reply.id,
      NOW
    );

    expect(notification?.data).toEqual({
      courseTitle: base.course.title,
      courseSlug: base.course.slug,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
    });
  });

  it("keeps the trigger data flat — scalar values only, safe for the compact feed", () => {
    const lesson = addLesson("Union Narrowing");
    const question = addComment(
      base.user.id,
      lesson.id,
      null,
      "How do unions narrow?"
    );
    const rio = addStudent("Rio Student");
    const reply = addComment(
      rio.id,
      lesson.id,
      question.id,
      "Same question here."
    );

    const notification = buildCommentReplyPostedNotification(
      db,
      reply.id,
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

  it("builds nothing for a reply that does not exist", () => {
    const notification = buildCommentReplyPostedNotification(
      db,
      999999,
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

describe("buildCourseStatusChangedNotification", () => {
  it("notifies the course's Instructor, never the acting Platform Admin", () => {
    const alex = addAdmin("Alex Admin");

    const notification = buildCourseStatusChangedNotification(
      db,
      base.course.id,
      CourseStatus.Draft,
      CourseStatus.Published,
      alex.id,
      NOW
    );

    expect(notification?.workflowKey).toBe("course-status-changed");
    expect(notification?.recipients).toEqual([
      {
        id: base.instructor.id,
        name: "Test Instructor",
        email: base.instructor.email,
        avatarUrl: null,
      },
    ]);
    expect(notification?.actor).toEqual({
      id: alex.id,
      name: "Alex Admin",
      email: alex.email,
      avatarUrl: null,
    });
  });

  it("carries the from-status, the to-status and the course as the context", () => {
    const alex = addAdmin("Alex Admin");

    const notification = buildCourseStatusChangedNotification(
      db,
      base.course.id,
      CourseStatus.Published,
      CourseStatus.Archived,
      alex.id,
      NOW
    );

    expect(notification?.data).toEqual({
      courseId: base.course.id,
      courseTitle: base.course.title,
      fromStatus: CourseStatus.Published,
      toStatus: CourseStatus.Archived,
      status: CourseStatus.Archived,
    });
  });

  it("builds nothing for a transition that lands in Draft", () => {
    const alex = addAdmin("Alex Admin");

    const notification = buildCourseStatusChangedNotification(
      db,
      base.course.id,
      CourseStatus.Published,
      CourseStatus.Draft,
      alex.id,
      NOW
    );

    expect(notification).toBeNull();
  });

  it("builds nothing when the course already has the chosen status", () => {
    const alex = addAdmin("Alex Admin");

    const notification = buildCourseStatusChangedNotification(
      db,
      base.course.id,
      CourseStatus.Published,
      CourseStatus.Published,
      alex.id,
      NOW
    );

    expect(notification).toBeNull();
  });

  it("never notifies a Platform Admin acting on their own course", () => {
    const alex = addAdmin("Alex Admin");
    db.update(schema.courses)
      .set({ instructorId: alex.id })
      .where(eq(schema.courses.id, base.course.id))
      .run();

    const notification = buildCourseStatusChangedNotification(
      db,
      base.course.id,
      CourseStatus.Draft,
      CourseStatus.Published,
      alex.id,
      NOW
    );

    expect(notification).toBeNull();
  });

  it("builds nothing for a course that does not exist", () => {
    const alex = addAdmin("Alex Admin");

    const notification = buildCourseStatusChangedNotification(
      db,
      999999,
      CourseStatus.Draft,
      CourseStatus.Published,
      alex.id,
      NOW
    );

    expect(notification).toBeNull();
  });
});
