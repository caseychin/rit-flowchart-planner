import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { TermSeason } from "@/ingest/types";

export async function getAnyCourseId(client: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await client.from("catalog_courses").select("id, code").order("code").limit(1).single();
  if (error || !data) throw error ?? new Error("No catalog_courses rows found — run ingestion first.");
  return data.id;
}

export async function clearAvailability(
  client: SupabaseClient<Database>,
  courseId: string,
  seasons: TermSeason[],
): Promise<void> {
  await client.from("catalog_course_availability").delete().eq("course_id", courseId).in("season", seasons);
}
