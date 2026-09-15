import { describe, it, expect } from "vitest";
import {
  summarizeAvailability,
  AVAILABILITY_CONFIDENCE_THRESHOLD,
} from "@/lib/catalog/availability";

describe("summarizeAvailability", () => {
  it("marks confirmed=true at/above the threshold", () => {
    const [row] = summarizeAvailability([
      {
        season: "fall",
        is_offered: true,
        confidence: AVAILABILITY_CONFIDENCE_THRESHOLD,
        source: "catalog_text",
      },
    ]);
    expect(row.confirmed).toBe(true);
  });

  it("marks confirmed=false just below the threshold (never guesses)", () => {
    const [row] = summarizeAvailability([
      {
        season: "spring",
        is_offered: true,
        confidence: AVAILABILITY_CONFIDENCE_THRESHOLD - 0.01,
        source: "observed",
      },
    ]);
    expect(row.confirmed).toBe(false);
  });

  it("carries raw confidence through unchanged for transparency", () => {
    const [row] = summarizeAvailability([
      { season: "summer", is_offered: false, confidence: 0.2, source: "plan_of_study" },
    ]);
    expect(row.confidence).toBe(0.2);
    expect(row.confirmed).toBe(false);
  });
});
