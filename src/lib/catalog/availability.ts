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
  confidence: number;
  source: AvailabilityRow["source"];
  /**
   * True only above AVAILABILITY_CONFIDENCE_THRESHOLD. Consumers should
   * treat an unconfirmed row as unknown/absent, not as a downgraded
   * warning — raw confidence is included for transparency, not so a caller
   * invents its own threshold and reintroduces the false-warning risk
   * Decision 7 exists to prevent.
   */
  confirmed: boolean;
}

export function summarizeAvailability(
  rows: AvailabilityRow[],
): AvailabilitySummary[] {
  return rows.map((row) => ({
    season: row.season,
    isOffered: row.is_offered,
    confidence: row.confidence,
    source: row.source,
    confirmed: row.confidence >= AVAILABILITY_CONFIDENCE_THRESHOLD,
  }));
}
