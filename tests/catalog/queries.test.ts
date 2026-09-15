import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import {
  searchCourses,
  getCourseDetail,
  listPrograms,
} from "@/lib/catalog/queries";

// Runs against the real DEV Supabase project, read-only, using only the
// anon/publishable key — catalog_* tables have "catalog readable" RLS
// policies (`using (true)`), so no session is needed to exercise these
// query functions directly, same as production API-route behavior for any
// signed-in user. Grounded in real ingested data (Tasks 2-5) rather than
// fixtures, following rls-cross-user.test.ts's precedent: the point is to
// prove the query layer against the real schema/data shape, not a mock.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function makeClient(): SupabaseClient<Database> {
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set (see .env.example)",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

let supabase: SupabaseClient<Database>;

beforeAll(() => {
  supabase = makeClient();
});

describe("searchCourses", () => {
  it("finds a known course by code fragment", async () => {
    const results = await searchCourses(supabase, "CSCI-141");
    expect(results.some((c) => c.code === "CSCI-141")).toBe(true);
  });

  it("finds a known course by title fragment", async () => {
    const results = await searchCourses(supabase, "Computer Science I");
    expect(results.some((c) => c.code === "CSCI-141")).toBe(true);
  });

  it("returns [] for an empty/whitespace query rather than the whole catalog", async () => {
    expect(await searchCourses(supabase, "")).toEqual([]);
    expect(await searchCourses(supabase, "   ")).toEqual([]);
  });

  it("returns [] for a query matching nothing", async () => {
    expect(await searchCourses(supabase, "ZZZZ-NOPE-999")).toEqual([]);
  });

  it("does not throw on PostgREST filter-grammar characters in the query", async () => {
    // Regression: commas/parens are .or()'s own delimiters, not SQL syntax —
    // escaping only %/_ let a raw "," or ")" split/close the filter early.
    await expect(
      searchCourses(supabase, "Intro, Advanced Topics (CS)"),
    ).resolves.toEqual([]);
    await expect(searchCourses(supabase, "a,b)c(d")).resolves.toEqual([]);
  });
});

describe("getCourseDetail", () => {
  it("returns null for an id that doesn't exist", async () => {
    expect(
      await getCourseDetail(supabase, "00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });

  it("returns full detail with a null prereqTree when prereq_parse_status is not 'parsed'", async () => {
    const [summary] = await searchCourses(supabase, "CSCI-141");
    const detail = await getCourseDetail(supabase, summary.id);
    expect(detail).not.toBeNull();
    expect(detail!.code).toBe("CSCI-141");
    expect(detail!.prereqParseStatus).not.toBe("parsed");
    expect(detail!.prereqTree).toBeNull();
    expect(Array.isArray(detail!.availability)).toBe(true);
  });

  it("builds a structured prereq tree when prereq_parse_status is 'parsed'", async () => {
    const [summary] = await searchCourses(supabase, "CSCI-142");
    const detail = await getCourseDetail(supabase, summary.id);
    expect(detail).not.toBeNull();
    expect(detail!.prereqParseStatus).toBe("parsed");
    expect(detail!.prereqTree).not.toBeNull();
  });

  it("only returns availability rows above the confidence threshold", async () => {
    const [summary] = await searchCourses(supabase, "CSCI-141");
    const detail = await getCourseDetail(supabase, summary.id);
    for (const a of detail!.availability) {
      expect(a.confidence).toBeGreaterThanOrEqual(0.5);
    }
  });
});

describe("listPrograms", () => {
  it("finds Computer Science BS with its known 126-credit total", async () => {
    const programs = await listPrograms(supabase);
    const csBs = programs.find((p) => p.slug === "computer-science-bs");
    expect(csBs).toBeDefined();
    expect(csBs!.totalCredits).toBe(126);
  });

  it("filters by program type", async () => {
    const majors = await listPrograms(supabase, { type: "major" });
    expect(majors.length).toBeGreaterThan(0);
    expect(majors.every((p) => p.type === "major")).toBe(true);
  });
});
