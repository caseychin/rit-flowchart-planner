// PostgREST caps every select at the project's max-rows (1000 by default) and
// truncates silently. Any read of a table that grows past that (courses,
// term offerings, slots) must page through it with this. `page` must apply a
// stable .order() before .range(), or rows can repeat or go missing across
// pages.
//
// shortcut: assumes max-rows is at least PAGE_SIZE. If the project lowers it,
// a full page looks short and reading stops early; lower PAGE_SIZE to match.
const PAGE_SIZE = 1000;

export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
