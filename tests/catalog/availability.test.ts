import { describe, it, expect } from "vitest";
import {
  summarizeAvailability,
  AVAILABILITY_CONFIDENCE_THRESHOLD,
} from "@/lib/catalog/availability";

describe("summarizeAvailability", () => {
  it("includes a row at/above the threshold", () => {
    const rows = summarizeAvailability([
      {
        season: "fall",
        is_offered: true,
        confidence: AVAILABILITY_CONFIDENCE_THRESHOLD,
        source: "catalog_text",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].season).toBe("fall");
  });

  it("drops a row just below the threshold (never guesses)", () => {
    const rows = summarizeAvailability([
      {
        season: "spring",
        is_offered: true,
        confidence: AVAILABILITY_CONFIDENCE_THRESHOLD - 0.01,
        source: "observed",
      },
    ]);
    expect(rows).toEqual([]);
  });

  it("drops low-confidence rows while keeping confirmed ones from the same set", () => {
    const rows = summarizeAvailability([
      { season: "summer", is_offered: false, confidence: 0.2, source: "plan_of_study" },
      { season: "fall", is_offered: true, confidence: 0.9, source: "catalog_text" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].season).toBe("fall");
    expect(rows[0].confidence).toBe(0.9);
  });
});
