// Shared catalog_subjects/catalog_courses lookups used by both ingestion
// adapters — Decision 4 (schema-decisions.md) makes (subject_code,
// catalog_number) the business key both sources reconcile against.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/** Seeds a stub catalog_subjects row (code as its own name) if one doesn't
 * already exist. Never overwrites a real name a vocabulary writer set. */
export async function ensureSubjectStub(client: SupabaseClient<Database>, subjectCode: string): Promise<void> {
  const { error } = await client
    .from("catalog_subjects")
    .upsert({ code: subjectCode, name: subjectCode }, { onConflict: "code", ignoreDuplicates: true });
  if (error) throw error;
}

export async function findCourseId(
  client: SupabaseClient<Database>,
  subjectCode: string,
  catalogNumber: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("catalog_courses")
    .select("id")
    .eq("subject_code", subjectCode)
    .eq("catalog_number", catalogNumber)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}
