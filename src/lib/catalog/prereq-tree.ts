// Reconstructs the nested tree that src/prereqs/write-prereq-tree.ts
// flattened into catalog_course_prerequisites rows. This is the read-side
// inverse of that writer.

export interface PrereqRow {
  id: string;
  parent_id: string | null;
  node_type: "group" | "course" | "unparsed";
  logic: string | null;
  required_course_id: string | null;
  min_grade: string | null;
  raw_fragment: string | null;
  is_corequisite: boolean;
  sort_order: number;
  required_course: { code: string | null; title: string } | null;
}

export interface PrereqTreeGroupNode {
  nodeType: "group";
  logic: "AND" | "OR";
  children: PrereqTreeNode[];
}

export interface PrereqTreeCourseNode {
  nodeType: "course";
  courseId: string;
  code: string;
  title: string;
  minGrade: string | null;
  isCorequisite: boolean;
}

export interface PrereqTreeUnparsedNode {
  nodeType: "unparsed";
  rawFragment: string;
  isCorequisite: boolean;
}

export type PrereqTreeNode =
  | PrereqTreeGroupNode
  | PrereqTreeCourseNode
  | PrereqTreeUnparsedNode;

/**
 * Callers must only pass rows for a course whose prereq_parse_status is
 * 'parsed' — this function trusts its input and does not itself apply the
 * warn-only bar (Decision 7). Returns null for an empty row set.
 */
export function buildPrereqTree(rows: PrereqRow[]): PrereqTreeNode | null {
  if (rows.length === 0) return null;

  const byParent = new Map<string | null, PrereqRow[]>();
  for (const row of rows) {
    const list = byParent.get(row.parent_id) ?? [];
    list.push(row);
    byParent.set(row.parent_id, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }

  function toNode(row: PrereqRow): PrereqTreeNode {
    if (row.node_type === "group") {
      return {
        nodeType: "group",
        logic: (row.logic as "AND" | "OR") ?? "AND",
        children: (byParent.get(row.id) ?? []).map(toNode),
      };
    }
    if (row.node_type === "course") {
      return {
        nodeType: "course",
        courseId: row.required_course_id ?? "",
        code: row.required_course?.code ?? "",
        title: row.required_course?.title ?? "",
        minGrade: row.min_grade,
        isCorequisite: row.is_corequisite,
      };
    }
    return {
      nodeType: "unparsed",
      rawFragment: row.raw_fragment ?? "",
      isCorequisite: row.is_corequisite,
    };
  }

  const roots = byParent.get(null) ?? [];
  if (roots.length === 0) return null;
  // write-prereq-tree.ts always writes exactly one top-level node per
  // course; a forest here would mean that invariant broke upstream. Wrap
  // rather than silently drop the extra roots.
  if (roots.length === 1) return toNode(roots[0]);
  return { nodeType: "group", logic: "AND", children: roots.map(toNode) };
}
