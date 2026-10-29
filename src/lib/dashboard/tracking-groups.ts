import { findTrackingRow } from "./tracking-model";
export const trackingGroups = [
  {
    name: "د. ماجد",
    tone: "border-sky-500/30 bg-sky-500/5",
    branches: [
      "الشروق",
      "مدينتي",
      "شيراتون",
      "روكسي",
      "الدقي",
      "الحكمة",
      "الحجاز",
      "هايد بارك",
      "ديستركت",
      "ديستركت5",
      "الجامعة",
    ],
  },
  {
    name: "د. محمد حسن",
    tone: "border-violet-500/30 bg-violet-500/5",
    branches: [
      "دريم",
      "سوديك",
      "المعادي 1",
      "المعادي 2",
      "دارك ستور المعادي",
      "التجمع",
      "واترواي",
      "سوديك إيست",
      "ميفيدا",
    ],
  },
  {
    name: "د. مصطفي علي",
    tone: "border-amber-500/30 bg-amber-500/5",
    branches: [
      "الطيران",
      "حسنين",
      "سيتي",
      "مكرم",
      "زايد",
      "دارك ستور زايد",
      "مول العرب",
      "سفنكس",
      "دارك ستور الكيت كات",
    ],
  },
  {
    name: "فروع موسمية",
    tone: "border-emerald-500/30 bg-emerald-500/5",
    branches: ["العلمين", "مراسي", "سوديك سيزر", "المخازن المركزية"],
  },
] as const;
// Stable branch identity takes precedence over spelling or a later display-name change.
const trackingBranchOwners: Record<string, string> = {
  "b8488fe0-4b60-4c57-abf1-070431346b95": "د. ماجد",
};
export function groupTrackingRows<
  T extends { id: string; branch_name: string; branch_id?: string | null },
>(rows: T[]) {
  const assigned = new Set<string>();
  const groups = trackingGroups
    .map((group) => ({
      ...group,
      rows: [
        ...group.branches.flatMap((name) => {
          const row = findTrackingRow(
            name,
            rows.filter((entry) => {
              const owner = trackingBranchOwners[entry.branch_id ?? ""];
              return !owner || owner === group.name;
            }),
          );
          if (!row || assigned.has(row.id)) return [];
          assigned.add(row.id);
          return [row];
        }),
        ...rows.filter((row) => {
          if (assigned.has(row.id) || trackingBranchOwners[row.branch_id ?? ""] !== group.name)
            return false;
          assigned.add(row.id);
          return true;
        }),
      ],
    }))
    .filter((group) => group.rows.length > 0);
  const additional = rows.filter((row) => !assigned.has(row.id));
  return additional.length
    ? [
        ...groups,
        { name: "فروع إضافية", tone: "border-border bg-muted/20", branches: [], rows: additional },
      ]
    : groups;
}
