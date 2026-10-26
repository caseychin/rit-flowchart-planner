// Shared season-name parsing for both ingestion sources — the Programs API
// grid/course-detail text and TigerCenter's term descriptions all use the
// same fall/spring/summer/intersession vocabulary.
import type { TermSeason } from "@/ingest/types";

const SEASON_MAP: Record<string, TermSeason> = {
  fall: "fall",
  spring: "spring",
  summer: "summer",
  intersession: "intersession",
};

export function parseSeason(text: string): TermSeason | undefined {
  return SEASON_MAP[text.trim().toLowerCase()];
}
