import { afterEach, describe, expect, it, vi } from "vitest";
import { currentMonthBounds } from "./dates";
afterEach(() => vi.useRealTimers());
describe("dashboard calendar behavior", () => {
  it("opens November on November 1 in Cairo, never January 1 or October", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-31T22:01:00Z"));
    expect(currentMonthBounds()).toEqual({ start: "2026-11-01", end: "2026-11-30" });
  });
  it("preserves Cairo month boundaries when UTC is still in the previous month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-30T23:30:00Z"));
    expect(currentMonthBounds()).toEqual({ start: "2026-07-01", end: "2026-07-31" });
  });
  it("preserves February leap years and December year boundaries", () => {
    vi.useFakeTimers();
    for (const [date, start, end] of [
      ["2024-02-15", "2024-02-01", "2024-02-29"],
      ["2026-02-15", "2026-02-01", "2026-02-28"],
      ["2026-12-15", "2026-12-01", "2026-12-31"],
    ]) {
      vi.setSystemTime(new Date(`${date}T12:00:00Z`));
      expect(currentMonthBounds()).toEqual({ start, end });
    }
  });
});
