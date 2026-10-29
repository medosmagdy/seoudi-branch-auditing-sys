import { Circle, Clock3, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { groupTrackingRows } from "@/lib/dashboard/tracking-groups";
import {
  TRACKING_PROGRAMS,
  TRACKING_STATUSES,
  trackingField,
  type MonthlyTrackingRow,
  type TrackingField,
} from "@/lib/dashboard/tracking-model";
import type { DashboardProgram } from "@/lib/dashboard/metrics";
export type TrackingRow = Pick<
  MonthlyTrackingRow,
  "id" | "branch_name" | "fs_status" | "ghp_status" | "fsms_status"
> &
  Partial<Pick<MonthlyTrackingRow, "branch_id" | "persisted" | "audit_counts">>;
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

export function MonthlyTrackingCard({
  rows,
  onUpdate,
  canEdit,
  month,
  program = "all",
  loading = false,
  error = null,
  onRetry,
  pendingKey = null,
}: {
  rows: TrackingRow[];
  onUpdate: (id: string, field: TrackingField, value: string) => Promise<void>;
  canEdit: boolean;
  month?: string;
  program?: DashboardProgram | "all";
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  pendingKey?: string | null;
}) {
  const programs = program === "all" ? TRACKING_PROGRAMS : [program];
  const groups = groupTrackingRows(rows);
  const date = month ? new Date(`${month.slice(0, 7)}-01T12:00:00Z`) : new Date();
  const monthLabel = new Intl.DateTimeFormat("ar-EG", {
    month: "long",
    year: "numeric",
    timeZone: "Africa/Cairo",
  }).format(date);
  return (
    <section className="mt-4 space-y-4" dir="rtl" aria-label="المتابعة الشهرية" aria-busy={loading}>
      <div className="surface-card rounded-xl border border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-bold">شيت المتابعة الشهري</h2>
            <p className="max-w-2xl text-xs leading-6 text-muted-foreground">
              الحالات تتحدث تلقائيًا من فحوصات الشهر المختار. وجود فحص معتمد يجعل البرنامج مكتملًا،
              حتى لو توجد مسودة أخرى.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{monthLabel}</Badge>
            {onRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                disabled={loading || Boolean(pendingKey)}
                aria-label="تحديث المتابعة الشهرية"
              >
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> تحديث
              </Button>
            )}
          </div>
        </div>
        {!loading && !error && rows.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {programs.map((item) => {
              const completed = rows.filter(
                (row) => row[trackingField(item)] === "completed",
              ).length;
              const drafts = rows.filter(
                (row) => row[trackingField(item)] === "in_progress",
              ).length;
              return (
                <div key={item} className="rounded-lg border bg-muted/20 px-4 py-3">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-bold" dir="ltr">
                      {item}
                    </span>
                    <span>
                      <strong className="text-emerald-700 dark:text-emerald-300">
                        {completed}
                      </strong>{" "}
                      / {rows.length} مكتمل
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {drafts} غير مكتمل · {rows.length - completed - drafts} لم يبدأ
                  </p>
                </div>
              );
            })}
          </div>
        )}
        {canEdit && !loading && !error && (
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            يمكن تعديل الحالة يدويًا للبرنامج الذي لا توجد له فحوصات فقط. ترتيب التبديل: لم يبدأ ←
            غير مكتمل ← مكتمل.
          </p>
        )}
      </div>
      {loading ? (
        <div
          role="status"
          className="surface-card flex items-center justify-center gap-2 rounded-xl border p-10 text-sm text-muted-foreground"
        >
          <Loader2 className="size-5 animate-spin" /> جارٍ تحميل فحوصات الشهر وحالات المتابعة…
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm"
        >
          <p className="font-semibold text-destructive">تعذر تحميل المتابعة الشهرية</p>
          <p className="mt-2 break-words text-muted-foreground">{error}</p>
          {onRetry && (
            <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>
              إعادة المحاولة
            </Button>
          )}
        </div>
      ) : rows.length === 0 ? (
        <div className="surface-card rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          لا توجد فروع مطابقة للفلاتر المختارة.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {groups.map((group) => (
            <div key={group.name} className={`overflow-hidden rounded-xl border ${group.tone}`}>
              <div className="flex items-center justify-between gap-3 border-b border-inherit px-4 py-3">
                <h3 className="text-sm font-bold">{group.name}</h3>
                <Badge variant="secondary">{group.rows.length} فروع</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-background/70 text-xs">
                    <tr>
                      <th scope="col" className="min-w-36 px-4 py-3 text-right">
                        الفرع
                      </th>
                      {programs.map((item) => (
                        <th key={item} scope="col" className="min-w-28 px-3 py-3" dir="ltr">
                          {item}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-card/70">
                    {group.rows.map((row) => (
                      <tr key={row.id} className="border-t border-border/60 hover:bg-muted/30">
                        <th scope="row" className="px-4 py-3 text-right font-medium">
                          {row.branch_name}
                        </th>
                        {programs.map((item) => {
                          const field = trackingField(item);
                          const config = trackingStatus[row[field]];
                          const Icon = config.icon;
                          const count = row.audit_counts?.[item];
                          const automatic = Boolean(count && count.submitted + count.drafts > 0);
                          const busy = pendingKey === `${row.id}:${field}`;
                          const detail = automatic
                            ? `${count!.submitted} فحص معتمد، ${count!.drafts} مسودة`
                            : "متابعة يدوية";
                          return (
                            <td key={item} className="px-2 py-3 text-center">
                              <button
                                type="button"
                                className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity enabled:hover:opacity-75 disabled:cursor-default ${config.className}`}
                                title={detail}
                                aria-label={`${row.branch_name} — ${item}: ${config.label}؛ ${detail}`}
                                disabled={!canEdit || automatic || Boolean(pendingKey)}
                                onClick={() => {
                                  if (canEdit && !automatic && !pendingKey)
                                    void onUpdate(
                                      row.id,
                                      field,
                                      TRACKING_STATUSES[
                                        (TRACKING_STATUSES.indexOf(row[field]) + 1) %
                                          TRACKING_STATUSES.length
                                      ]!,
                                    );
                                }}
                              >
                                {busy ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Icon className="size-3.5" />
                                )}
                                {config.label}
                              </button>
                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {automatic
                                  ? `تلقائي · ${count!.submitted ? `${count!.submitted} معتمد` : `${count!.drafts} مسودة`}`
                                  : "يدوي"}
                              </p>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
