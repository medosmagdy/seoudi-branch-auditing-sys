import { AlertTriangle, CheckCircle2, MessageSquare } from "lucide-react";
import { Progress } from "@/components/ui/progress";
export function SectionCard({ sec, onSelect }: { sec: any; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="dashboard-section-card w-full text-right cursor-pointer rounded-lg border border-border bg-card p-3 shadow-xs hover:border-primary hover:shadow-sm transition-all active:scale-[0.99]"
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
    </button>
  );
}
