// ─── Lesson material ───
// The pure rule behind the "New lesson available" Event: a lesson is
// born empty, so "lesson created" would point Students at a blank page —
// the Event is the save that brings a lesson its first consumable
// material. No database, no clock: the rule reads two snapshots and
// answers one question, which makes every transition in the spec's
// catalog — including the accepted blank-then-restore edge — pinnable
// by plain tests.
//
// The lesson save action can write empty content over material (the
// schema permits ""), so transitions are not one-way; the rule is
// exactly "the pre-update row had neither material, and the save brings
// at least one".

export type LessonMaterial = {
  content: string | null;
  videoUrl: string | null;
};

function hasMaterial(material: LessonMaterial): boolean {
  const content = (material.content ?? "").trim();
  const videoUrl = (material.videoUrl ?? "").trim();
  return content !== "" || videoUrl !== "";
}

/**
 * Does this save bring the lesson's first consumable material? `before`
 * is the lesson row captured before the save; `saved` is what the save
 * carries, exactly as the lesson editor's action writes it — an empty
 * video URL keeps the old one, so it brings nothing. A lesson whose
 * material was blanked away and then restored fires the Event once
 * more — the accepted edge, chosen over exactly-once, which would need
 * a new per-lesson column.
 */
export function bringsFirstMaterial(
  before: LessonMaterial,
  saved: LessonMaterial
): boolean {
  return !hasMaterial(before) && hasMaterial(saved);
}
