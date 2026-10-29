/** The caller must provide a stable order (ending with a unique key). */
export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  signal?: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    signal?.throwIfAborted();
    const { data, error } = await fetchPage(from, from + size - 1);
    if (error) throw error;
    signal?.throwIfAborted();
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
}
