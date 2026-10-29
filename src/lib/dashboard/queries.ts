import { queryOptions } from "@tanstack/react-query";
import { fetchDashboardData, type DetailFilters } from "./data";
import { fetchDashboardSnapshot, type DashboardFilters } from "./snapshot";

import { DASHBOARD_QUERY_ROOT } from "./cache";
export { DASHBOARD_QUERY_ROOT } from "./cache";
const freshness = {
  staleTime: 30_000,
  refetchOnMount: true,
  refetchOnWindowFocus: false,
  retry: 1,
} as const;

// Program filtering is local for the RPC snapshot: the server returns all programs.
export function dashboardSnapshotOptions(userId: string | undefined, filters: DashboardFilters) {
  return queryOptions({
    ...freshness,
    queryKey: [
      ...DASHBOARD_QUERY_ROOT,
      "snapshot",
      userId,
      filters.scope,
      filters.start,
      filters.end,
      filters.branch,
      !!filters.submittedOnly,
      filters.allowedBranchIds ?? null,
    ],
    queryFn: ({ signal }) => fetchDashboardSnapshot(filters, signal),
  });
}

// Details depend on the selected scope/filters, never on a request's completion time.
export function dashboardDetailOptions(
  userId: string | undefined,
  scope: DashboardFilters["scope"],
  tab: "overview" | "tracking",
  filters: DetailFilters,
) {
  return queryOptions({
    ...freshness,
    queryKey: [
      ...DASHBOARD_QUERY_ROOT,
      "details",
      userId,
      scope,
      tab,
      filters.start,
      filters.end,
      filters.branch,
      !!filters.submittedOnly,
      filters.allowedBranchIds ?? null,
      filters.program ?? "all",
      filters.includeAnswers !== false,
    ],
    queryFn: ({ signal }) => fetchDashboardData(scope, filters, signal),
  });
}
