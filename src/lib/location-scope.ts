export type LocationScope = "branches" | "warehouses";

export const CENTRAL_WAREHOUSE_NAME = "المخازن المركزية";

export function isCentralWarehouse(location: { name_ar?: string | null; name?: string | null }) {
  return (location.name_ar || location.name || "").trim() === CENTRAL_WAREHOUSE_NAME;
}

export function matchesLocationScope(
  location: { name_ar?: string | null; name?: string | null },
  scope: LocationScope,
) {
  return scope === "warehouses" ? isCentralWarehouse(location) : !isCentralWarehouse(location);
}

export function locationScopeLabel(scope: LocationScope) {
  return scope === "warehouses" ? "المخازن" : "الفروع";
}
