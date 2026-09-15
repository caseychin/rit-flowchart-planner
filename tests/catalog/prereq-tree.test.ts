import { describe, it, expect } from "vitest";
import { buildPrereqTree, type PrereqRow } from "@/lib/catalog/prereq-tree";

function row(overrides: Partial<PrereqRow>): PrereqRow {
  return {
    id: "row",
    parent_id: null,
    node_type: "unparsed",
    logic: null,
    required_course_id: null,
    min_grade: null,
    raw_fragment: null,
    is_corequisite: false,
    sort_order: 0,
    required_course: null,
    ...overrides,
  };
}

describe("buildPrereqTree", () => {
  it("returns null for an empty row set", () => {
    expect(buildPrereqTree([])).toBeNull();
  });

  it("rebuilds a single course leaf", () => {
    const tree = buildPrereqTree([
      row({
        id: "a",
        node_type: "course",
        required_course_id: "course-1",
        required_course: { code: "CSCI-243", title: "The Mechanics of Programming" },
        min_grade: "C-",
      }),
    ]);
    expect(tree).toEqual({
      nodeType: "course",
      courseId: "course-1",
      code: "CSCI-243",
      title: "The Mechanics of Programming",
      minGrade: "C-",
      isCorequisite: false,
    });
  });

  it("rebuilds nested groups in sort_order, mirroring write-prereq-tree.ts's flatten shape", () => {
    // "CSCI-243 and (CSCI-261 or CSCI-262)"
    const tree = buildPrereqTree([
      row({ id: "root", node_type: "group", logic: "AND", sort_order: 0 }),
      row({
        id: "leaf-243",
        parent_id: "root",
        node_type: "course",
        required_course_id: "id-243",
        required_course: { code: "CSCI-243", title: "The Mechanics of Programming" },
        sort_order: 0,
      }),
      row({ id: "or-group", parent_id: "root", node_type: "group", logic: "OR", sort_order: 1 }),
      row({
        id: "leaf-261",
        parent_id: "or-group",
        node_type: "course",
        required_course_id: "id-261",
        required_course: { code: "CSCI-261", title: "Analysis of Algorithms" },
        sort_order: 0,
      }),
      row({
        id: "leaf-262",
        parent_id: "or-group",
        node_type: "course",
        required_course_id: "id-262",
        required_course: { code: "CSCI-262", title: "Analysis of Algorithms II" },
        sort_order: 1,
      }),
    ]);

    expect(tree).toEqual({
      nodeType: "group",
      logic: "AND",
      children: [
        {
          nodeType: "course",
          courseId: "id-243",
          code: "CSCI-243",
          title: "The Mechanics of Programming",
          minGrade: null,
          isCorequisite: false,
        },
        {
          nodeType: "group",
          logic: "OR",
          children: [
            {
              nodeType: "course",
              courseId: "id-261",
              code: "CSCI-261",
              title: "Analysis of Algorithms",
              minGrade: null,
              isCorequisite: false,
            },
            {
              nodeType: "course",
              courseId: "id-262",
              code: "CSCI-262",
              title: "Analysis of Algorithms II",
              minGrade: null,
              isCorequisite: false,
            },
          ],
        },
      ],
    });
  });

  it("preserves an unparsed leaf's raw fragment rather than dropping it", () => {
    const tree = buildPrereqTree([
      row({ id: "a", node_type: "unparsed", raw_fragment: "4th year standing" }),
    ]);
    expect(tree).toEqual({
      nodeType: "unparsed",
      rawFragment: "4th year standing",
      isCorequisite: false,
    });
  });

  it("respects sort_order even when rows arrive out of order", () => {
    const tree = buildPrereqTree([
      row({ id: "root", node_type: "group", logic: "AND" }),
      row({
        id: "second",
        parent_id: "root",
        node_type: "unparsed",
        raw_fragment: "second",
        sort_order: 1,
      }),
      row({
        id: "first",
        parent_id: "root",
        node_type: "unparsed",
        raw_fragment: "first",
        sort_order: 0,
      }),
    ]);
    expect(tree).toEqual({
      nodeType: "group",
      logic: "AND",
      children: [
        { nodeType: "unparsed", rawFragment: "first", isCorequisite: false },
        { nodeType: "unparsed", rawFragment: "second", isCorequisite: false },
      ],
    });
  });
});
