import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { buildPrereqTree, type PrereqTreeNode } from "./prereq-tree";
import { summarizeAvailability, type AvailabilitySummary } from "./availability";

type Client = SupabaseClient<Database>;
type ProgramType = Database["public"]["Enums"]["program_type"];

const MAX_SEARCH_RESULTS = 25;

export interface CourseSummary {
  id: string;
  code: string;
  title: string;
  creditsMin: number | null;
  creditsMax: number | null;
}

/**
 * Search catalog_courses by code or title fragment, case-insensitive.
 * Empty/whitespace query returns [] rather than the whole catalog — this is
 * a search endpoint, not a list-everything one.
 */
export async function searchCourses(
  supabase: Client,
  query: string,
): Promise<CourseSummary[]> {
  const q = query.trim();
  if (!q) return [];

  // Escape SQL LIKE wildcards (%, _) first, then wrap the whole value in
  // PostgREST's own double-quote syntax (escaping internal " and \) before
  // interpolating into .or() — .or() parses its argument as PostgREST
  // filter grammar, where , and ) are clause delimiters, not literal
  // characters. Backslash-escaping those delimiters is NOT valid PostgREST
  // syntax (confirmed against the live API: it 400s) — double-quoting the
  // value is the documented way to pass an arbitrary string through a
  // horizontal-filtering operator like ilike inside or().
  const likeEscaped = q.replace(/[%_]/g, (m) => `\\${m}`);
  const pgrestQuoted = `"%${likeEscaped.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}%"`;
  const { data, error } = await supabase
    .from("catalog_courses")
    .select("id, code, title, credits_min, credits_max")
    .or(`code.ilike.${pgrestQuoted},title.ilike.${pgrestQuoted}`)
    .order("code")
    .limit(MAX_SEARCH_RESULTS);

  if (error) throw error;

  return (data ?? []).map((c) => ({
    id: c.id,
    code: c.code ?? "",
    title: c.title,
    creditsMin: c.credits_min,
    creditsMax: c.credits_max,
  }));
}

export interface CourseDetail extends CourseSummary {
  description: string | null;
  career: string | null;
  prereqText: string | null;
  prereqParseStatus: Database["public"]["Enums"]["prereq_parse_status"];
  /**
   * Only populated when prereqParseStatus === 'parsed' (Decision 7 /
   * CLAUDE.md's warn-only rule: partial/failed/unparsed/none produce
   * silence here, not a best-effort guess). prereqText is always present
   * regardless, so the raw source text is never lost.
   */
  prereqTree: PrereqTreeNode | null;
  availability: AvailabilitySummary[];
}

/** Returns null if no course has this id (never throws for "not found"). */
export async function getCourseDetail(
  supabase: Client,
  courseId: string,
): Promise<CourseDetail | null> {
  const { data: course, error: courseError } = await supabase
    .from("catalog_courses")
    .select(
      "id, code, title, description, credits_min, credits_max, career, prereq_text, prereq_parse_status",
    )
    .eq("id", courseId)
    .maybeSingle();

  if (courseError?.code === "22P02") return null; // not a uuid, so it can't match a course
  if (courseError) throw courseError;
  if (!course) return null;

  const { data: availabilityRows, error: availabilityError } = await supabase
    .from("catalog_course_availability")
    .select("season, is_offered, confidence, source")
    .eq("course_id", courseId);
  if (availabilityError) throw availabilityError;

  let prereqTree: PrereqTreeNode | null = null;
  if (course.prereq_parse_status === "parsed") {
    const { data: prereqRows, error: prereqError } = await supabase
      .from("catalog_course_prerequisites")
      .select(
        "id, parent_id, node_type, logic, required_course_id, min_grade, raw_fragment, is_corequisite, sort_order, required_course:catalog_courses!catalog_course_prerequisites_required_course_id_fkey(code, title)",
      )
      .eq("course_id", courseId);
    if (prereqError) throw prereqError;
    prereqTree = buildPrereqTree(prereqRows ?? []);
  }

  return {
    id: course.id,
    code: course.code ?? "",
    title: course.title,
    description: course.description,
    career: course.career,
    creditsMin: course.credits_min,
    creditsMax: course.credits_max,
    prereqText: course.prereq_text,
    prereqParseStatus: course.prereq_parse_status,
    prereqTree,
    availability: summarizeAvailability(availabilityRows ?? []),
  };
}

export interface ProgramSummary {
  id: string;
  slug: string | null;
  name: string;
  type: ProgramType;
  degree: string | null;
  catalogYear: string;
  totalCredits: number | null;
}

export async function listPrograms(
  supabase: Client,
  filter?: { type?: ProgramType },
): Promise<ProgramSummary[]> {
  let query = supabase
    .from("catalog_programs")
    .select("id, slug, name, type, degree, catalog_year, total_credits")
    .order("name");

  if (filter?.type) {
    query = query.eq("type", filter.type);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    type: p.type,
    degree: p.degree,
    catalogYear: p.catalog_year,
    totalCredits: p.total_credits,
  }));
}
