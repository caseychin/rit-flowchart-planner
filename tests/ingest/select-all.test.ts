import { describe, it, expect } from "vitest";
import { selectAll } from "@/ingest/select-all";

function fakeTable(rowCount: number) {
  const rows = Array.from({ length: rowCount }, (_, i) => i);
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  };
  return { page, calls };
}

describe("selectAll", () => {
  it("reads past the 1000-row cap", async () => {
    const { page, calls } = fakeTable(2500);
    expect(await selectAll(page)).toHaveLength(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("asks once more after an exactly full page, then stops", async () => {
    const { page, calls } = fakeTable(1000);
    expect(await selectAll(page)).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });

  it("throws the page's error instead of returning partial rows", async () => {
    const failure = new Error("boom");
    await expect(selectAll(async () => ({ data: null, error: failure }))).rejects.toBe(failure);
  });
});
