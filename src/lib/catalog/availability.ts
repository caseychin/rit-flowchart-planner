import type { Database } from "@/types/supabase";

type AvailabilityRow = Pick<
  Database["public"]["Tables"]["catalog_course_availability"]["Row"],
  "season" | "is_offered" | "confidence" | "source"
>;

// Decision 7 (schema-decisions.md) is warn-only: never present an inference
// as fact below the confidence bar. This is the app-layer threshold the
// schema comment on catalog_course_availability defers to. Picked from
// scripts/seed-availability.ts's own scale (manual 1.0, catalog_text 0.9,
// observed 0.3 + 0.2 per additional confirming term, plan_of_study 0.2): 0.5
// is the point a single "observed" data point (0.3) cannot cross alone, but
// two confirming terms (0.3 + 0.2 = 0.5) or a stronger source can.
export const AVAILABILITY_CONFIDENCE_THRESHOLD = 0.5;

export interface AvailabilitySummary {
  season: AvailabilityRow["season"];
  isOffered: boolean;
  /** Included for transparency now that every returned row is confirmed. */
  confidence: number;
  source: AvailabilityRow["source"];
}

/**
 * Only returns rows at/above AVAILABILITY_CONFIDENCE_THRESHOLD — the
 * confidence gate is enforced here, not left for every future caller to
 * remember to check. A below-threshold claim is silence (Decision 7 /
 * CLAUDE.md's warn-only rule), not downgraded data for a caller to render
 * with a caveat.
 */
export function summarizeAvailability(
  rows: AvailabilityRow[],
): AvailabilitySummary[] {
  return rows
    .filter((row) => row.confidence >= AVAILABILITY_CONFIDENCE_THRESHOLD)
    .map((row) => ({
      season: row.season,
      isOffered: row.is_offered,
      confidence: row.confidence,
      source: row.source,
    }));
}
