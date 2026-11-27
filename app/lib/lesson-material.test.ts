import { describe, it, expect } from "vitest";
import { bringsFirstMaterial } from "./lesson-material";

// The first-material rule: the Event is the save that brings a lesson
// its first consumable material, so the cases below are the rule's whole
// vocabulary. `before` is the lesson row captured before the save; `saved`
// is what the save carries, exactly as the lesson editor's action writes
// it (empty content stays an empty string; an empty video URL keeps the
// old one, so it brings nothing).
describe("bringsFirstMaterial", () => {
  it("stays silent when a save brings nothing to an empty lesson", () => {
    expect(
      bringsFirstMaterial(
        { content: null, videoUrl: null },
        { content: "", videoUrl: null }
      )
    ).toBe(false);
  });

  it("fires when a save brings content alone", () => {
    expect(
      bringsFirstMaterial(
        { content: null, videoUrl: null },
        { content: "Welcome to the course.", videoUrl: null }
      )
    ).toBe(true);
  });

  it("fires when a save brings a video URL alone", () => {
    expect(
      bringsFirstMaterial(
        { content: null, videoUrl: null },
        { content: "", videoUrl: "https://www.youtube.com/watch?v=…" }
      )
    ).toBe(true);
  });

  it("stays silent for an ordinary edit after material exists", () => {
    expect(
      bringsFirstMaterial(
        { content: "The first material.", videoUrl: null },
        { content: "The first material, improved.", videoUrl: null }
      )
    ).toBe(false);
  });

  it("re-fires once when blanked content is restored", () => {
    // Blanking the lesson makes it material-less again — the schema
    // permits an empty string over material — so the save that blanks it
    // stays silent…
    expect(
      bringsFirstMaterial(
        { content: "The original material.", videoUrl: null },
        { content: "", videoUrl: null }
      )
    ).toBe(false);
    // …and the save that restores content afterwards is a first-material
    // save once more. The accepted edge: re-firing once beats exactly
    // once, which would need a new per-lesson column.
    expect(
      bringsFirstMaterial(
        { content: "", videoUrl: null },
        { content: "The restored material.", videoUrl: null }
      )
    ).toBe(true);
  });
});
