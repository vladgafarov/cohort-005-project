import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, desc, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { bookmarks, courses, lessons, modules, notes } from "~/db/schema";
import { MAX_NOTE_LENGTH } from "~/lib/saved";

// ─── Bookmarks and Notes ───
// A Bookmark is a Student's flag on a Lesson. A Note is a Student's private
// writing about a Lesson. Both are one per Student per Lesson, enforced by a
// unique index. See GLOSSARY.md for the language.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

export type Db = BetterSQLite3Database<typeof schema>;

type Note = typeof notes.$inferSelect;

export type SaveNoteResult =
  { ok: true; note: Note | null } | { ok: false; error: string };

export type SavedBookmark = {
  id: number;
  lessonId: number;
  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
  courseSlug: string;
  createdAt: string;
};

export type SavedNote = {
  id: number;
  body: string;
  updatedAt: string;
  lessonId: number;
  lessonTitle: string;
  courseTitle: string;
  courseSlug: string;
};

export function getBookmark(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId)))
    .get();
}

export function toggleBookmark(db: Db, userId: number, lessonId: number) {
  const existing = getBookmark(db, userId, lessonId);

  if (existing) {
    db.delete(bookmarks).where(eq(bookmarks.id, existing.id)).run();
    return false;
  }

  db.insert(bookmarks).values({ userId, lessonId }).run();
  return true;
}

export function getNote(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .get();
}

export function saveNote(
  db: Db,
  userId: number,
  lessonId: number,
  body: string,
  now: Date
): SaveNoteResult {
  const trimmed = body.trim();

  if (trimmed.length === 0) {
    deleteNote(db, userId, lessonId);
    return { ok: true, note: null };
  }

  if (trimmed.length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      error: `Note must be ${MAX_NOTE_LENGTH.toLocaleString("en-US")} characters or fewer`,
    };
  }

  const existing = getNote(db, userId, lessonId);
  const timestamp = now.toISOString();

  if (existing) {
    const note = db
      .update(notes)
      .set({ body: trimmed, updatedAt: timestamp })
      .where(eq(notes.id, existing.id))
      .returning()
      .get();

    return { ok: true, note };
  }

  const note = db
    .insert(notes)
    .values({
      userId,
      lessonId,
      body: trimmed,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
    .get();

  return { ok: true, note };
}

export function deleteNote(db: Db, userId: number, lessonId: number) {
  db.delete(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .run();
}

function savedLessonColumns() {
  return {
    lessonId: lessons.id,
    lessonTitle: lessons.title,
    courseTitle: courses.title,
    courseSlug: courses.slug,
  };
}

export function getSavedBookmarks(db: Db, userId: number): SavedBookmark[] {
  return db
    .select({
      id: bookmarks.id,
      createdAt: bookmarks.createdAt,
      moduleTitle: modules.title,
      ...savedLessonColumns(),
    })
    .from(bookmarks)
    .innerJoin(lessons, eq(bookmarks.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt), desc(bookmarks.id))
    .all();
}

export function getSavedNotes(db: Db, userId: number): SavedNote[] {
  return db
    .select({
      id: notes.id,
      body: notes.body,
      updatedAt: notes.updatedAt,
      ...savedLessonColumns(),
    })
    .from(notes)
    .innerJoin(lessons, eq(notes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt), desc(notes.id))
    .all();
}
