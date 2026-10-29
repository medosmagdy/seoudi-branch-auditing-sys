export type EditableAnswer = { score: number | null; isNa: boolean; comment: string };

export function editAnswer(
  current: EditableAnswer | undefined,
  patch: Partial<EditableAnswer>,
  maxScore: number,
): EditableAnswer {
  const previous = current ?? { score: maxScore, isNa: false, comment: "" };
  const next = { ...previous, ...patch };
  if (next.isNa) next.score = null;
  else if (previous.isNa && patch.isNa === false && patch.score == null) next.score = maxScore;
  return next;
}

// Serialize writes, retain failed latest values, and allow navigation only after saving.
export class AnswerWrites<T> {
  private tail: Promise<void> = Promise.resolve();
  private dirty = new Map<string, T>();
  private listeners = new Set<() => void>();
  getPendingCount = () => this.dirty.size;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private notify() {
    for (const listener of this.listeners) listener();
  }
  constructor(private save: (key: string, value: T) => Promise<void>) {}
  enqueue(key: string, value: T): Promise<void> {
    this.dirty.set(key, value);
    this.notify();
    const task = this.tail.then(async () => {
      await this.save(key, value);
      if (this.dirty.get(key) === value) {
        this.dirty.delete(key);
        this.notify();
      }
    });
    this.tail = task.catch(() => {});
    return task;
  }
  async flush(): Promise<void> {
    await this.tail;
    for (const [key, value] of [...this.dirty]) await this.enqueue(key, value);
  }
}
