import { describe, expect, it } from "vitest";
import { AnswerWrites, editAnswer } from "./answer-edit";

describe("answer editing", () => {
  it("does not invent a score when commenting on an untouched question", () => {
    expect(editAnswer(undefined, { comment: "note" }, 4)).toEqual({
      score: null,
      isNa: false,
      comment: "note",
    });
  });
  it("requires a new grade when leaving N/A", () => {
    expect(
      editAnswer({ score: null, isNa: true, comment: "note" }, { isNa: false, score: null }, 2)
        .score,
    ).toBeNull();
  });
  it("preserves zero on comments and explicit selection after N/A", () => {
    expect(editAnswer({ score: 0, isNa: false, comment: "" }, { comment: "note" }, 4).score).toBe(
      0,
    );
    expect(
      editAnswer({ score: null, isNa: true, comment: "" }, { score: 0, isNa: false }, 4).score,
    ).toBe(0);
  });
  it("does not guess the score for an old null answer", () => {
    expect(
      editAnswer({ score: null, isNa: false, comment: "old" }, { comment: "edited" }, 4).score,
    ).toBeNull();
  });
  it("clears scores for N/A", () => {
    expect(editAnswer({ score: 0, isNa: false, comment: "" }, { isNa: true }, 4).score).toBeNull();
  });
});

describe("answer persistence", () => {
  it("serializes writes and waits for the latest zero before allowing summary", async () => {
    const saved: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queue = new AnswerWrites<number>(async (_, value) => {
      if (value === 4) await gate;
      saved.push(value);
    });
    const first = queue.enqueue("q", 4);
    const second = queue.enqueue("q", 0);
    let flushed = false;
    const flush = queue.flush().then(() => {
      flushed = true;
    });
    await Promise.resolve();
    expect(flushed).toBe(false);
    release();
    await Promise.all([first, second, flush]);
    expect(saved).toEqual([4, 0]);
  });
  it("retries failed saves and prevents summary if persistence still fails", async () => {
    let fail = true;
    const queue = new AnswerWrites<number>(async () => {
      if (fail) throw new Error("offline");
    });
    await expect(queue.enqueue("q", 0)).rejects.toThrow("offline");
    await expect(queue.flush()).rejects.toThrow("offline");
    fail = false;
    await expect(queue.flush()).resolves.toBeUndefined();
  });
});

describe("visible unsaved answer state", () => {
  it("retains failed answers until a successful retry and notifies observers", async () => {
    let fail = true;
    const counts: number[] = [];
    const queue = new AnswerWrites<number>(async () => {
      if (fail) throw new Error("offline");
    });
    const unsubscribe = queue.subscribe(() => counts.push(queue.getPendingCount()));
    await expect(queue.enqueue("q", 0)).rejects.toThrow("offline");
    expect(queue.getPendingCount()).toBe(1);
    fail = false;
    await queue.flush();
    expect(queue.getPendingCount()).toBe(0);
    expect(counts).toEqual([1, 1, 0]);
    unsubscribe();
    await queue.enqueue("other", 4);
    expect(counts).toEqual([1, 1, 0]);
  });
});
