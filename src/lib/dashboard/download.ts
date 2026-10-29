import XLSX from "xlsx-js-style";
import { buildDashboardWorkbook, type DashboardWorkbookInput } from "./export";
import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "../query-pages";
import type { Tables } from "@/integrations/supabase/types";

export async function loadDashboardDeductions(auditIds: string[]) {
  const general: Tables<"audit_general_deductions">[] = [];
  const section: Tables<"audit_section_deductions">[] = [];
  const ids = [...new Set(auditIds)];
  for (let start = 0; start < ids.length; start += 40) {
    const batch = ids.slice(start, start + 40);
    const [g, s] = await Promise.all([
      readAllPages((from, to) =>
        supabase
          .from("audit_general_deductions")
          .select("*")
          .in("audit_id", batch)
          .order("id")
          .range(from, to),
      ),
      readAllPages((from, to) =>
        supabase
          .from("audit_section_deductions")
          .select("*")
          .in("audit_id", batch)
          .order("id")
          .range(from, to),
      ),
    ]);
    general.push(...g);
    section.push(...s);
  }
  return { genDeductions: general, secDeductions: section };
}
export function downloadDashboardWorkbook(input: DashboardWorkbookInput, filename: string) {
  const workbook = buildDashboardWorkbook(XLSX, input);
  XLSX.writeFile(workbook, filename);
}
