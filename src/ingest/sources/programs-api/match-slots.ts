// Pairs a program's freshly parsed slots with the slots already stored for it,
// so a re-ingest updates rows in place instead of delete-and-reinsert.
// flowchart_blocks.source_slot_id is `on delete set null`; wholesale replace
// would sever every block's provenance on every run, even when RIT changed
// nothing.
//
// Identity is what the slot *is* (kind, year, season, course or label), not
// sort_order: an inserted course shifts every later sort_order, and matching
// by position would point blocks at the wrong slot, which is worse than null.
// Repeats of the same identity in one term (e.g. two "General Education
// Elective" slots) are paired in sort_order.
import type { Database } from "@/types/supabase";

type SlotInsert = Database["public"]["Tables"]["catalog_requirement_slots"]["Insert"];
type SlotIdentityFields = Pick<SlotInsert, "kind" | "year_number" | "season" | "course_id" | "label">;
export type ExistingSlot = SlotIdentityFields & { id: string; sort_order: number };

export type SlotMatch = {
  updates: (SlotInsert & { id: string })[];
  inserts: SlotInsert[];
  deleteIds: string[];
};

function slotIdentity(s: SlotIdentityFields): string {
  const what = s.kind === "course" ? s.course_id : s.label;
  return [s.kind, s.year_number, s.season ?? "", what ?? ""].join("|");
}

export function matchSlots(existing: ExistingSlot[], incoming: SlotInsert[]): SlotMatch {
  const queues = new Map<string, string[]>();
  for (const s of [...existing].sort((a, b) => a.sort_order - b.sort_order)) {
    const key = slotIdentity(s);
    queues.set(key, [...(queues.get(key) ?? []), s.id]);
  }

  const result: SlotMatch = { updates: [], inserts: [], deleteIds: [] };
  for (const s of [...incoming].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
    const id = queues.get(slotIdentity(s))?.shift();
    if (id) result.updates.push({ ...s, id });
    else result.inserts.push(s);
  }
  for (const ids of queues.values()) result.deleteIds.push(...ids);
  return result;
}
