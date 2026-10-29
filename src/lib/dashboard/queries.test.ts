import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const network = vi.hoisted(() => ({ snapshot: vi.fn(), details: vi.fn() }));
vi.mock("./snapshot", () => ({ fetchDashboardSnapshot: network.snapshot }));
vi.mock("./data", () => ({ fetchDashboardData: network.details }));
import { dashboardSnapshotOptions, dashboardDetailOptions, DASHBOARD_QUERY_ROOT } from "./queries";
const filters = {
  scope: "branches" as const,
  start: "2026-10-01",
  end: "2026-10-31",
  branch: "all",
  program: "all" as const,
};
const clients: QueryClient[] = [];
function client() {
  const c = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  clients.push(c);
  return c;
}
beforeEach(() => {
  vi.clearAllMocks();
  network.snapshot.mockResolvedValue({ version: 1, locations: [], audits: [] });
  network.details.mockResolvedValue({ audits: [], branches: [] });
});
afterEach(() => {
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.useRealTimers();
});

describe("dashboard request scheduling and freshness", () => {
  it("starts details while the snapshot is still pending, removing a serial network wait", async () => {
    let finish!: (value: unknown) => void;
    network.snapshot.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const c = client();
    const snapshot = c.fetchQuery(dashboardSnapshotOptions("admin", filters));
    const details = c.fetchQuery(dashboardDetailOptions("admin", "branches", "overview", filters));
    await details;
    expect(network.details).toHaveBeenCalledOnce();
    expect(c.getQueryState(dashboardSnapshotOptions("admin", filters).queryKey)?.status).toBe(
      "pending",
    );
    finish({ version: 1, locations: [], audits: [] });
    await snapshot;
  });
  it("serves repeat visits from the fresh in-memory cache with zero extra requests", async () => {
    const c = client();
    const snapshot = dashboardSnapshotOptions("admin", filters);
    const details = dashboardDetailOptions("admin", "branches", "overview", filters);
    await Promise.all([c.fetchQuery(snapshot), c.fetchQuery(details)]);
    await Promise.all([c.fetchQuery(snapshot), c.fetchQuery(details)]);
    expect(network.snapshot).toHaveBeenCalledOnce();
    expect(network.details).toHaveBeenCalledOnce();
    // Completing/refetching a snapshot never creates a new detail cache entry.
    await c.invalidateQueries({ queryKey: snapshot.queryKey });
    await c.fetchQuery(snapshot);
    await c.fetchQuery(details);
    expect(network.snapshot).toHaveBeenCalledTimes(2);
    expect(network.details).toHaveBeenCalledOnce();
  });
  it("refetches after 30 seconds and dashboard-wide invalidation refreshes both datasets", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    const c = client();
    const snapshot = dashboardSnapshotOptions("admin", filters);
    const details = dashboardDetailOptions("admin", "branches", "overview", filters);
    await Promise.all([c.fetchQuery(snapshot), c.fetchQuery(details)]);
    vi.setSystemTime(new Date("2026-10-24T12:00:31Z"));
    await Promise.all([c.fetchQuery(snapshot), c.fetchQuery(details)]);
    expect(network.snapshot).toHaveBeenCalledTimes(2);
    expect(network.details).toHaveBeenCalledTimes(2);
    await c.invalidateQueries({ queryKey: DASHBOARD_QUERY_ROOT });
    await Promise.all([c.fetchQuery(snapshot), c.fetchQuery(details)]);
    expect(network.snapshot).toHaveBeenCalledTimes(3);
    expect(network.details).toHaveBeenCalledTimes(3);
  });
  it("isolates users, branches, months, scope and detail programs; shares program-independent snapshots", () => {
    const base = dashboardSnapshotOptions("admin", filters).queryKey;
    expect(dashboardSnapshotOptions("other", filters).queryKey).not.toEqual(base);
    for (const change of [
      { branch: "b" },
      { start: "2026-09-01" },
      { end: "2026-09-30" },
      { scope: "warehouses" as const },
    ]) {
      expect(dashboardSnapshotOptions("admin", { ...filters, ...change }).queryKey).not.toEqual(
        base,
      );
    }
    expect(dashboardSnapshotOptions("admin", { ...filters, program: "FS" }).queryKey).toEqual(base);
    expect(
      dashboardDetailOptions("admin", "branches", "overview", { ...filters, program: "FS" })
        .queryKey,
    ).not.toEqual(dashboardDetailOptions("admin", "branches", "overview", filters).queryKey);
    expect(
      dashboardDetailOptions("admin", "branches", "tracking", { ...filters, includeAnswers: false })
        .queryKey,
    ).not.toEqual(dashboardDetailOptions("admin", "branches", "overview", filters).queryKey);
  });
  it("keeps disabled/unauthorized observers from requesting either dataset", () => {
    const c = client();
    const snapshot = new QueryObserver(c, {
      ...dashboardSnapshotOptions("auditor", filters),
      enabled: false,
    });
    const details = new QueryObserver(c, {
      ...dashboardDetailOptions("auditor", "branches", "overview", filters),
      enabled: false,
    });
    const stop = [snapshot.subscribe(() => {}), details.subscribe(() => {})];
    expect(network.snapshot).not.toHaveBeenCalled();
    expect(network.details).not.toHaveBeenCalled();
    stop.forEach((fn) => fn());
  });
  it("forwards cancellation to both loaders", async () => {
    network.snapshot.mockImplementation(
      (_filters, signal: AbortSignal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("cancelled"))),
        ),
    );
    network.details.mockImplementation(
      (_scope, _filters, signal: AbortSignal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("cancelled"))),
        ),
    );
    const c = client();
    const jobs = [
      c.fetchQuery(dashboardSnapshotOptions("admin", filters)),
      c.fetchQuery(dashboardDetailOptions("admin", "branches", "overview", filters)),
    ];
    await c.cancelQueries({ queryKey: DASHBOARD_QUERY_ROOT });
    expect((await Promise.allSettled(jobs)).every((result) => result.status === "rejected")).toBe(
      true,
    );
    expect(network.snapshot.mock.calls[0]![1].aborted).toBe(true);
    expect(network.details.mock.calls[0]![2].aborted).toBe(true);
  });
});

it("separates submitted-only manager caches from unrestricted audit data", () => {
  const manager = { ...filters, submittedOnly: true };
  expect(dashboardSnapshotOptions("same", manager).queryKey).not.toEqual(
    dashboardSnapshotOptions("same", filters).queryKey,
  );
  expect(dashboardDetailOptions("same", "branches", "overview", manager).queryKey).not.toEqual(
    dashboardDetailOptions("same", "branches", "overview", filters).queryKey,
  );
});

it("separates branch-restricted snapshot and detail caches", () => {
  const restricted = { ...filters, allowedBranchIds: ["allowed"] };
  expect(dashboardSnapshotOptions("manager", restricted).queryKey).not.toEqual(
    dashboardSnapshotOptions("manager", filters).queryKey,
  );
  expect(
    dashboardDetailOptions("manager", "branches", "overview", restricted).queryKey,
  ).not.toEqual(dashboardDetailOptions("manager", "branches", "overview", filters).queryKey);
});
