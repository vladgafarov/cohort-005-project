import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  deleteNote,
  getBookmark,
  getNote,
  getSavedBookmarks,
  getSavedNotes,
  saveNote,
  toggleBookmark,
} from "./saved.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let otherLessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const mod = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Lesson 1", position: 1 })
    .returning()
    .get().id;

  otherLessonId = db
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Lesson 2", position: 2 })
    .returning()
    .get().id;
});

describe("bookmarks", () => {
  it("toggles a bookmark on and off", () => {
    expect(getBookmark(db, base.user.id, lessonId)).toBeUndefined();

    expect(toggleBookmark(db, base.user.id, lessonId)).toBe(true);
    expect(getBookmark(db, base.user.id, lessonId)).toMatchObject({
      userId: base.user.id,
      lessonId,
    });

    expect(toggleBookmark(db, base.user.id, lessonId)).toBe(false);
    expect(getBookmark(db, base.user.id, lessonId)).toBeUndefined();
  });

  it("keeps each learner's bookmarks separate", () => {
    toggleBookmark(db, base.user.id, lessonId);
    toggleBookmark(db, base.instructor.id, otherLessonId);

    expect(
      getSavedBookmarks(db, base.user.id).map((row) => row.lessonId)
    ).toEqual([lessonId]);
  });

  it("returns saved bookmarks newest first with their lesson and course", () => {
    db.insert(schema.bookmarks)
      .values([
        {
          userId: base.user.id,
          lessonId,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          userId: base.user.id,
          lessonId: otherLessonId,
          createdAt: "2026-02-01T00:00:00.000Z",
        },
      ])
      .run();

    const rows = getSavedBookmarks(db, base.user.id);

    expect(rows.map((row) => row.lessonId)).toEqual([otherLessonId, lessonId]);
    expect(rows[0]).toMatchObject({
      lessonTitle: "Lesson 2",
      moduleTitle: "Basics",
      courseTitle: "Test Course",
      courseSlug: "test-course",
    });
  });
});

describe("notes", () => {
  it("creates a note with the body trimmed", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonId,
      "  Remember the generics section  ",
      NOW
    );

    expect(result).toMatchObject({
      ok: true,
      note: {
        userId: base.user.id,
        lessonId,
        body: "Remember the generics section",
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    });
  });

  it("updates the existing note instead of inserting a second one", () => {
    saveNote(db, base.user.id, lessonId, "First draft", NOW);
    const later = new Date(NOW.getTime() + 60_000);

    expect(
      saveNote(db, base.user.id, lessonId, "Second draft", later)
    ).toMatchObject({ ok: true, note: { body: "Second draft" } });

    const rows = db.select().from(schema.notes).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      body: "Second draft",
      createdAt: NOW.toISOString(),
      updatedAt: later.toISOString(),
    });
  });

  it("keeps each learner's notes separate", () => {
    saveNote(db, base.user.id, lessonId, "Mine", NOW);
    saveNote(db, base.instructor.id, lessonId, "Theirs", NOW);

    expect(getSavedNotes(db, base.user.id).map((row) => row.body)).toEqual([
      "Mine",
    ]);
  });

  it("refuses a note over 2,000 characters", () => {
    expect(saveNote(db, base.user.id, lessonId, "a".repeat(2001), NOW)).toEqual(
      {
        ok: false,
        error: "Note must be 2,000 characters or fewer",
      }
    );
    expect(getNote(db, base.user.id, lessonId)).toBeUndefined();
  });

  it("deletes the note when the body is cleared", () => {
    saveNote(db, base.user.id, lessonId, "Something", NOW);

    expect(saveNote(db, base.user.id, lessonId, "   ", NOW)).toEqual({
      ok: true,
      note: null,
    });
    expect(getNote(db, base.user.id, lessonId)).toBeUndefined();
  });

  it("deletes a note outright", () => {
    saveNote(db, base.user.id, lessonId, "Something", NOW);

    deleteNote(db, base.user.id, lessonId);

    expect(getNote(db, base.user.id, lessonId)).toBeUndefined();
  });

  it("returns saved notes newest first with their lesson and course", () => {
    saveNote(db, base.user.id, lessonId, "Older", NOW);
    saveNote(
      db,
      base.user.id,
      otherLessonId,
      "Newer",
      new Date(NOW.getTime() + 60_000)
    );

    const rows = getSavedNotes(db, base.user.id);

    expect(rows.map((row) => row.lessonId)).toEqual([otherLessonId, lessonId]);
    expect(rows[0]).toMatchObject({
      body: "Newer",
      lessonTitle: "Lesson 2",
      courseTitle: "Test Course",
      courseSlug: "test-course",
    });
  });
});
