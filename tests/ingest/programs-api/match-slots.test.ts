import { describe, it, expect } from "vitest";
import { matchSlots, type ExistingSlot } from "@/ingest/sources/programs-api/match-slots";

const course = (id: string, courseId: string, sortOrder: number): ExistingSlot => ({
  id, kind: "course", year_number: 1, season: "fall", course_id: courseId, label: null, sort_order: sortOrder,
});
const gened = (id: string, sortOrder: number): ExistingSlot => ({
  id, kind: "placeholder", year_number: 1, season: "fall", course_id: null, label: "General Education Elective", sort_order: sortOrder,
});
const incoming = (s: ExistingSlot) => { const { id, ...rest } = s; void id; return { ...rest, program_id: "p" }; };

describe("matchSlots", () => {
  it("keeps every id when nothing changed", () => {
    const existing = [course("a", "CSCI-141", 0), gened("b", 1)];
    const m = matchSlots(existing, existing.map(incoming));
    expect(m.updates.map((u) => u.id)).toEqual(["a", "b"]);
    expect(m.inserts).toEqual([]);
    expect(m.deleteIds).toEqual([]);
  });

  it("matches by identity, not position, when a course is inserted mid-term", () => {
    const existing = [course("a", "CSCI-141", 0), course("b", "MATH-181", 1)];
    const next = [course("_", "CSCI-141", 0), course("_", "NEW-100", 1), course("_", "MATH-181", 2)].map(incoming);
    const m = matchSlots(existing, next);
    expect(m.updates.map((u) => [u.id, u.course_id, u.sort_order])).toEqual([
      ["a", "CSCI-141", 0],
      ["b", "MATH-181", 2],
    ]);
    expect(m.inserts.map((i) => i.course_id)).toEqual(["NEW-100"]);
    expect(m.deleteIds).toEqual([]);
  });

  it("deletes only slots RIT removed", () => {
    const m = matchSlots([course("a", "CSCI-141", 0), course("b", "MATH-181", 1)], [incoming(course("_", "CSCI-141", 0))]);
    expect(m.updates.map((u) => u.id)).toEqual(["a"]);
    expect(m.deleteIds).toEqual(["b"]);
  });

  it("pairs repeated placeholders in sort order and deletes the surplus", () => {
    const existing = [gened("g2", 5), gened("g1", 2), gened("g3", 7)];
    const m = matchSlots(existing, [gened("_", 3), gened("_", 4)].map(incoming));
    expect(m.updates.map((u) => [u.id, u.sort_order])).toEqual([["g1", 3], ["g2", 4]]);
    expect(m.deleteIds).toEqual(["g3"]);
  });

  it("treats a slot moved to another term as removed + added", () => {
    const moved = { ...course("_", "CSCI-141", 0), season: "spring" as const };
    const m = matchSlots([course("a", "CSCI-141", 0)], [incoming(moved)]);
    expect(m.updates).toEqual([]);
    expect(m.inserts).toHaveLength(1);
    expect(m.deleteIds).toEqual(["a"]);
  });
});
