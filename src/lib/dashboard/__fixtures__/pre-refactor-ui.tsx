// @ts-nocheck -- original presentation copied verbatim from 5cafb64. Test only.
import { Circle, Clock3, CheckCircle2, AlertTriangle, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
export type TrackingRow = {
  id: string;
  branch_name: string;
  fs_status: "not_started" | "in_progress" | "completed";
  ghp_status: "not_started" | "in_progress" | "completed";
  fsms_status: "not_started" | "in_progress" | "completed";
};

const trackingStatus = {
  not_started: { label: "لم يبدأ", className: "bg-muted text-muted-foreground", icon: Circle },
  in_progress: {
    label: "غير مكتمل",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    icon: Clock3,
  },
  completed: {
    label: "مكتمل",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    icon: CheckCircle2,
  },
} as const;

const trackingGroups = [
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
      "هايد",
      "ديستركت",
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
      "سوديك ايست",
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
      "الكيت كات",
    ],
  },
  {
    name: "فروع مشتركة",
    tone: "border-emerald-500/30 bg-emerald-500/5",
    branches: ["العلمين", "مراسي", "سوديك سيزر", "المخازن المركزية"],
  },
] as const;

export function MonthlyTrackingCard({
  rows,
  onUpdate,
  canEdit,
}: {
  rows: TrackingRow[];
  onUpdate: (
    id: string,
    field: "fs_status" | "ghp_status" | "fsms_status",
    value: string,
  ) => Promise<void>;
  canEdit: boolean;
}) {
  const cycle = (row: TrackingRow, field: "fs_status" | "ghp_status" | "fsms_status") => {
    const values = ["not_started", "in_progress", "completed"] as const;
    return onUpdate(row.id, field, values[(values.indexOf(row[field]) + 1) % values.length]);
  };
  return (
    <section
      className="mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-3">
        <div>
          <h2 className="font-bold">شيت المتابعة الشهري</h2>
          <p className="text-xs text-muted-foreground">
            اضغط على الحالة للتبديل: لم يبدأ ← غير مكتمل ← مكتمل
          </p>
        </div>
        <Badge variant="outline">
          {new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(new Date())}
        </Badge>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2">
        {trackingGroups.map((group) => {
          const groupRows = group.branches.map((name) => {
            const exact = rows.find((row) => row.branch_name.trim() === name);
            const compatible =
              exact ??
              rows.find(
                (row) => row.branch_name.trim().includes(name) && !["سوديك", "زايد"].includes(name),
              );
            return (
              compatible ??
              ({
                id: `missing-${group.name}-${name}`,
                branch_name: name,
                fs_status: "not_started",
                ghp_status: "not_started",
                fsms_status: "not_started",
              } satisfies TrackingRow)
            );
          });
          return (
            <div key={group.name} className={`overflow-hidden rounded-xl border ${group.tone}`}>
              <div className="border-b border-inherit px-4 py-3">
                <h3 className="font-bold">{group.name}</h3>
                <p className="text-xs text-muted-foreground">{group.branches.length} فروع</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-background/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-right">الفرع</th>
                      <th className="px-3 py-2">FS</th>
                      <th className="px-3 py-2">GHP</th>
                      <th className="px-3 py-2">FSMS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupRows.map((row) => (
                      <tr key={row.id} className="border-t border-border/60">
                        <td className="px-3 py-2 font-medium">{row.branch_name}</td>
                        {(["fs_status", "ghp_status", "fsms_status"] as const).map((field) => {
                          const config = trackingStatus[row[field]];
                          const Icon = config.icon;
                          return (
                            <td key={field} className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  canEdit &&
                                  !row.id.startsWith("missing-") &&
                                  void cycle(row, field)
                                }
                                disabled={!canEdit || row.id.startsWith("missing-")}
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-opacity hover:opacity-75 ${config.className}`}
                              >
                                <Icon className="size-3.5" />
                                {config.label}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground md:col-span-2">
            لا توجد بيانات متابعة لهذا الشهر بعد.
          </div>
        )}
      </div>
    </section>
  );
}

export function SectionCard({ sec, onSelect }: { sec: any; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      className="cursor-pointer rounded-lg border border-border bg-card p-3 shadow-xs hover:border-primary hover:shadow-sm transition-all active:scale-[0.99]"
      dir="rtl"
    >
      <div className="flex justify-between items-start mb-1.5">
        <span className="font-bold text-xs text-foreground">{sec.nameAr}</span>
        <span
          className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
            sec.complianceRate >= 90
              ? "bg-emerald-100 text-emerald-800"
              : sec.complianceRate >= 75
                ? "bg-amber-100 text-amber-800"
                : "bg-destructive/10 text-destructive"
          }`}
        >
          {sec.complianceRate}% امتثال
        </span>
      </div>

      <div className="my-2">
        <Progress value={sec.complianceRate} className="h-1.5" />
      </div>

      <div className="flex justify-between items-center text-[11px] pt-1.5 border-t border-border/50">
        <span className="flex items-center gap-1 text-muted-foreground font-semibold">
          <MessageSquare className="size-3 text-primary" /> {sec.commentsCount} عدم مطابقة
        </span>
        {sec.criticalCount > 0 ? (
          <span className="flex items-center gap-1 text-destructive font-semibold text-[10px]">
            <AlertTriangle className="size-3" /> {sec.criticalCount} حرجة
          </span>
        ) : (
          <span className="flex items-center gap-1 text-emerald-600 text-[10px]">
            <CheckCircle2 className="size-3" /> ممتثل
          </span>
        )}
      </div>
    </div>
  );
}
