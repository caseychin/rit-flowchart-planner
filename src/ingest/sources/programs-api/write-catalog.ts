// Writes a ParsedProgram to catalog_programs / catalog_requirement_groups /
// catalog_requirement_slots, plus minimal stub catalog_subjects /
// catalog_courses rows to satisfy FKs.
//
// Ownership rule: Task 2 fully owns program/group/slot rows for a program it
// ingests (groups are wholesale-replaced each run; slots are matched and
// updated in place so their ids, and flowchart_blocks.source_slot_id, survive
// re-ingest; see match-slots.ts), but NEVER overwrites an existing
// catalog_courses row. That table's full enrichment (title, credits,
// description, prereq_text) is Task 3's job, reconciled by (subject_code,
// catalog_number) per schema-decisions.md Decision 4 — Task 2 only seeds a
// minimal stub if no row exists yet, so a re-run of this ingester never
// clobbers Task 3's later data.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ParsedProgram } from "@/ingest/types";
import { ensureSubjectStub, findCourseId } from "@/ingest/catalog-courses";
import { matchSlots } from "./match-slots";

function splitCourseCode(code: string): { subjectCode: string; catalogNumber: string } {
  const [subjectCode, ...rest] = code.split("-");
  return { subjectCode, catalogNumber: rest.join("-") };
}

export type WriteProgramResult = {
  programId: string;
  groupCount: number;
  slotCount: number;
  newCourseCount: number;
};

export async function writeProgramCurriculum(
  client: SupabaseClient<Database>,
  program: ParsedProgram & { degree?: string },
  type: Database["public"]["Enums"]["program_type"],
): Promise<WriteProgramResult> {
  const { data: programRow, error: programError } = await client
    .from("catalog_programs")
    .upsert(
      {
        slug: program.slug,
        catalog_year: program.catalogYear,
        name: program.name,
        degree: program.degree,
        type,
        total_credits: program.totalCredits,
        source: "programs_api",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug,catalog_year" },
    )
    .select("id")
    .single();
  if (programError || !programRow) throw programError ?? new Error("catalog_programs upsert returned no row");
  const programId = programRow.id;

  // Groups have no inbound references from user data, so replace them
  // wholesale; the old ones are deleted only after slots point at the new ones.
  const { data: oldGroups, error: oldGroupsError } = await client
    .from("catalog_requirement_groups")
    .select("id")
    .eq("program_id", programId);
  if (oldGroupsError) throw oldGroupsError;

  const groupIdByLocalId = new Map<string, string>();
  if (program.groups.length > 0) {
    const { data: insertedGroups, error: groupsError } = await client
      .from("catalog_requirement_groups")
      .insert(
        program.groups.map((g) => ({
          program_id: programId,
          title: g.title,
          select_count: g.selectCount,
          credits: g.credits,
          sort_order: g.sortOrder,
        })),
      )
      .select("id");
    if (groupsError) throw groupsError;
    program.groups.forEach((g, i) => groupIdByLocalId.set(g.localId, insertedGroups![i].id));
  }

  const courseIdCache = new Map<string, string>();
  let newCourseCount = 0;

  async function ensureCourse(code: string, title: string | undefined): Promise<string> {
    const cached = courseIdCache.get(code);
    if (cached) return cached;

    const { subjectCode, catalogNumber } = splitCourseCode(code);
    await ensureSubjectStub(client, subjectCode);

    const existingId = await findCourseId(client, subjectCode, catalogNumber);

    let id: string;
    if (existingId) {
      id = existingId;
    } else {
      const { data: inserted, error: insertError } = await client
        .from("catalog_courses")
        .insert({
          subject_code: subjectCode,
          catalog_number: catalogNumber,
          title: title ?? code,
          source: "programs_api",
        })
        .select("id")
        .single();
      if (insertError || !inserted) throw insertError ?? new Error("catalog_courses insert returned no row");
      id = inserted.id;
      newCourseCount += 1;
    }
    courseIdCache.set(code, id);
    return id;
  }

  // Explicit nulls (not undefined) so an in-place update clears a field RIT removed.
  const slotRows: Database["public"]["Tables"]["catalog_requirement_slots"]["Insert"][] = [];
  for (const slot of program.slots) {
    const courseId = slot.courseCode ? await ensureCourse(slot.courseCode, slot.courseTitle) : null;
    slotRows.push({
      program_id: programId,
      group_id: (slot.groupLocalId && groupIdByLocalId.get(slot.groupLocalId)) || null,
      year_number: slot.yearNumber,
      season: slot.season,
      sort_order: slot.sortOrder,
      kind: slot.kind,
      course_id: courseId,
      label: slot.kind === "placeholder" ? (slot.label ?? null) : null,
      credits: slot.credits ?? null,
      category_hint: slot.categoryHint ?? null,
      notes: slot.notes ?? null,
    });
  }

  const { data: existingSlots, error: existingSlotsError } = await client
    .from("catalog_requirement_slots")
    .select("id, kind, year_number, season, course_id, label, sort_order")
    .eq("program_id", programId);
  if (existingSlotsError) throw existingSlotsError;
  const { updates, inserts, deleteIds } = matchSlots(existingSlots, slotRows);

  if (updates.length > 0) {
    const { error } = await client.from("catalog_requirement_slots").upsert(updates);
    if (error) throw error;
  }
  if (inserts.length > 0) {
    const { error } = await client.from("catalog_requirement_slots").insert(inserts);
    if (error) throw error;
  }
  if (deleteIds.length > 0) {
    const { error } = await client.from("catalog_requirement_slots").delete().in("id", deleteIds);
    if (error) throw error;
  }

  const oldGroupIds = oldGroups.map((g) => g.id);
  if (oldGroupIds.length > 0) {
    const { error } = await client.from("catalog_requirement_groups").delete().in("id", oldGroupIds);
    if (error) throw error;
  }

  return { programId, groupCount: program.groups.length, slotCount: slotRows.length, newCourseCount };
}
