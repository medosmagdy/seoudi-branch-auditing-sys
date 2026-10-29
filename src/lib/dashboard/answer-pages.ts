/** Keep every answer while reducing sequential network round-trips.
 * If exact counts are unavailable, retain the original sequential pagination.
 */
export async function readAnswerPages<T>(
  fetchPage: (
    from: number,
    to: number,
    count: boolean,
  ) => PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>,
  signal?: AbortSignal,
  identify?: (row: T) => string,
) {
  const size = 500;
  signal?.throwIfAborted();
  const first = await fetchPage(0, size - 1, true);
  if (first.error) throw first.error;
  signal?.throwIfAborted();
  const rows = [...(first.data ?? [])];
  const validate = () => {
    if (typeof first.count === "number" && rows.length !== first.count)
      throw new Error("تعذر تحميل جميع الإجابات؛ أعد المحاولة");
    if (identify && new Set(rows.map(identify)).size !== rows.length)
      throw new Error("تغيّرت الإجابات أثناء التحميل؛ أعد المحاولة");
    return rows;
  };
  if (rows.length < size) return validate();
  if (
    typeof first.count === "number" &&
    Number.isSafeInteger(first.count) &&
    first.count >= rows.length
  ) {
    for (let from = size; from < first.count; from += size * 3) {
      signal?.throwIfAborted();
      const offsets = [from, from + size, from + size * 2].filter(
        (offset) => offset < first.count!,
      );
      const results = await Promise.all(
        offsets.map((offset) => fetchPage(offset, offset + size - 1, false)),
      );
      signal?.throwIfAborted();
      for (const result of results) {
        if (result.error) throw result.error;
        rows.push(...(result.data ?? []));
      }
    }
    return validate();
  }
  for (let from = size; ; from += size) {
    signal?.throwIfAborted();
    const result = await fetchPage(from, from + size - 1, false);
    if (result.error) throw result.error;
    signal?.throwIfAborted();
    rows.push(...(result.data ?? []));
    if (!result.data || result.data.length < size) return validate();
  }
}
