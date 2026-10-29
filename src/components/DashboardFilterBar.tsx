import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardProgram } from "@/lib/dashboard/metrics";

export interface DashboardFilterBarProps {
  locations: { id: string; name_ar: string }[];
  branch: string;
  fromMonth: string;
  toMonth: string;
  program: DashboardProgram | "all";
  onBranch: (value: string) => void;
  onFromMonth: (value: string) => void;
  onToMonth: (value: string) => void;
  onResetPeriod: () => void;
  onProgram: (value: DashboardProgram | "all") => void;
}
export function DashboardFilterBar(props: DashboardFilterBarProps) {
  const fieldId = useId();
  return (
    <div
      className="dashboard-filter-bar grid grid-cols-1 items-end gap-x-5 gap-y-4 rounded-xl bg-muted/20 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]"
      dir="rtl"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={`${fieldId}-branch`} className="px-1 text-xs font-semibold leading-5">
          الفرع
        </label>
        <Select dir="rtl" value={props.branch} onValueChange={props.onBranch}>
          <SelectTrigger
            id={`${fieldId}-branch`}
            className="h-10 w-full rounded-lg px-3 text-right"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value="all">كل الفروع</SelectItem>
            {props.locations.map((branch) => (
              <SelectItem key={branch.id} value={branch.id}>
                {branch.name_ar}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={`${fieldId}-from-month`} className="px-1 text-xs font-semibold leading-5">
          من شهر
        </label>
        <Input
          id={`${fieldId}-from-month`}
          aria-label="من شهر"
          dir="ltr"
          type="month"
          max={props.toMonth || undefined}
          value={props.fromMonth}
          onChange={(e) => props.onFromMonth(e.target.value)}
          className="h-10 w-full min-w-0 rounded-lg px-3"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={`${fieldId}-to-month`} className="px-1 text-xs font-semibold leading-5">
          إلى شهر
        </label>
        <Input
          id={`${fieldId}-to-month`}
          aria-label="إلى شهر"
          dir="ltr"
          type="month"
          min={props.fromMonth || undefined}
          value={props.toMonth}
          onChange={(e) => props.onToMonth(e.target.value)}
          className="h-10 w-full min-w-0 rounded-lg px-3"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={`${fieldId}-program`} className="px-1 text-xs font-semibold leading-5">
          نوع الفحص
        </label>
        <Select
          dir="rtl"
          value={props.program}
          onValueChange={(value) => props.onProgram(value as DashboardProgram | "all")}
        >
          <SelectTrigger
            id={`${fieldId}-program`}
            className="h-10 w-full rounded-lg px-3 text-right"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent dir="rtl">
            <SelectItem value="all">كل الأوديتس</SelectItem>
            <SelectItem value="FS">Food Safety — FS</SelectItem>
            <SelectItem value="GHP">GHP</SelectItem>
            <SelectItem value="FSMS">FSMS</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-10 rounded-lg px-5 sm:col-span-2 xl:col-span-1"
        onClick={() => {
          props.onResetPeriod();
          props.onBranch("all");
          props.onProgram("all");
        }}
      >
        مسح الفلاتر
      </Button>
      {!props.fromMonth && !props.toMonth && (
        <span className="px-1 text-xs text-muted-foreground sm:col-span-2 xl:col-span-5">
          كل الشهور
        </span>
      )}
    </div>
  );
}
