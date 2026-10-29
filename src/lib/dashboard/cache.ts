import type { QueryClient } from "@tanstack/react-query";
export const DASHBOARD_QUERY_ROOT = ["dashboard-data-full"] as const;

// A successful write makes both the snapshot and details stale immediately.
// Keep this module free of data loaders so write screens do not import dashboard code.
export function invalidateDashboard(client: QueryClient) {
  return client.invalidateQueries({ queryKey: DASHBOARD_QUERY_ROOT });
}
