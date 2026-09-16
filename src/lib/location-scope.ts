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

export function isWarehouseAuditType(type: { code?: string | null; name_ar?: string | null; name_en?: string | null }) {
  const value = [type.code, type.name_ar, type.name_en].filter(Boolean).join(" ").toLowerCase();
  return /\(\s*wh\s*\)|\bwh\b|warehouse|مخازن|مخزن/.test(value);
}

export function matchesAuditTypeScope(type: { code?: string | null; name_ar?: string | null; name_en?: string | null }, scope: LocationScope) {
  return scope === "warehouses" ? isWarehouseAuditType(type) : !isWarehouseAuditType(type);
}
