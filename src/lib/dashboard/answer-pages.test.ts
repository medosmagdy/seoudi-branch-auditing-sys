import { describe, it, expect, vi } from "vitest";
import { readAnswerPages } from "./answer-pages";
describe("bounded parallel answer paging", () => {
  it("keeps exact row order despite different completion order and limits outstanding pages to three", async () => {
    const rows = Array.from({ length: 2300 }, (_, id) => id);
    let active = 0,
      max = 0;
    const counts: boolean[] = [];
    const read = vi.fn(async (from: number, to: number, count: boolean) => {
      counts.push(count);
      active++;
      max = Math.max(max, active);
      await new Promise((resolve) => setTimeout(resolve, from === 500 ? 8 : 1));
      active--;
      return { data: rows.slice(from, to + 1), error: null, count: count ? rows.length : null };
    });
    expect(await readAnswerPages(read)).toEqual(rows);
    expect(max).toBe(3);
    expect(read).toHaveBeenCalledTimes(5);
    expect(counts.filter(Boolean)).toHaveLength(1);
  });
  it("falls back to the complete original pagination without count headers", async () => {
    const rows = Array.from({ length: 1200 }, (_, id) => id);
    const read = vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));
    expect(await readAnswerPages(read)).toEqual(rows);
    expect(read.mock.calls.map((args) => args[0])).toEqual([0, 500, 1000]);
  });
  it("never returns a partial result after a page failure or cancellation", async () => {
    const first = Array(500).fill(1);
    await expect(
      readAnswerPages(async (from) => ({
        data: from ? null : first,
        error: from ? new Error("failed") : null,
        count: 1000,
      })),
    ).rejects.toThrow("failed");
    const controller = new AbortController();
    controller.abort();
    const read = vi.fn();
    await expect(readAnswerPages(read, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(read).not.toHaveBeenCalled();
  });
});

it("rejects truncated and shifted pages instead of returning incomplete scores", async () => {
  await expect(
    readAnswerPages(async () => ({ data: [1], error: null, count: 1000 })),
  ).rejects.toThrow("جميع الإجابات");
  const page = Array.from({ length: 500 }, (_, id) => ({ id: String(id) }));
  await expect(
    readAnswerPages(
      async () => ({ data: page, error: null, count: 1000 }),
      undefined,
      (row) => row.id,
    ),
  ).rejects.toThrow("تغيّرت الإجابات");
});
