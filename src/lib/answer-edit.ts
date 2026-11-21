export type EditableAnswer = { score: number | null; isNa: boolean; comment: string };

export function editAnswer(
  current: EditableAnswer | undefined,
  patch: Partial<EditableAnswer>,
  maxScore: number,
): EditableAnswer {
  const previous = current ?? { score: null, isNa: false, comment: "" };
  const next = { ...previous, ...patch };
  if (next.isNa) next.score = null;
  else if (previous.isNa && patch.isNa === false && patch.score == null) next.score = null;
  return next;
}

// Serialize writes, retain failed latest values, and allow navigation only after saving.
export class AnswerWrites<T> {
  private tail: Promise<void> = Promise.resolve();
  private dirty = new Map<string, { value: T }>();
  private flushing: Promise<void> | null = null;
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
    const change = { value };
    this.dirty.set(key, change);
    this.notify();
    return this.queueSave(key, change);
  }
  private queueSave(key: string, change: { value: T }, retry = false): Promise<void> {
    const task = this.tail.then(async () => {
      if (retry && this.dirty.get(key) !== change) return;
      await this.save(key, change.value);
      if (this.dirty.get(key) === change) {
        this.dirty.delete(key);
        this.notify();
      }
    });
    this.tail = task.catch(() => {});
    return task;
  }
  flush(): Promise<void> {
    this.flushing ??= this.drain().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }
  private async drain(): Promise<void> {
    for (;;) {
      const pending = this.tail;
      await pending;
      if (this.tail !== pending) continue;
      if (!this.dirty.size) return;
      for (const [key, change] of [...this.dirty]) {
        if (this.dirty.get(key) !== change) continue;
        try {
          // A retry must never make an old value the latest edit again.
          await this.queueSave(key, change, true);
        } catch (error) {
          if (this.dirty.get(key) === change) throw error;
        }
      }
    }
  }
}
