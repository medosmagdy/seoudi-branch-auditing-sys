// Frozen expiry transformations from 5cafb64, unchanged at extraction. Test only.
import type * as XLSXType from "xlsx";
export const EXPIRY_SECTIONS = ["الأسماك", "الجزارة", "الجبن", "المخبوزات", "الخضروات و الفاكهة", "المبردات", "المجمدات", "الوجبات الجاهزة", "البقالة الجافة", "التوصيل", "الاستلامات", "عام"] as const;
export const EXPIRY_STATES = ["صلاحية", "تزوير", "تدوير"] as const;
export type ExpiryState = (typeof EXPIRY_STATES)[number];

export type ExpiryRecord = {
  id: string;
  expiry_date: string;
  branch_id: string;
  section: string;
  product_name: string;
  expiry_state: ExpiryState;
  deduction_percentage: number;
  deduction_scope: "section" | "branch";
  quantity: number | null;
  notes: string | null;
  deduction_reason?: string | null;
  created_by: string;
  review_status: "pending" | "reviewed";
  created_at: string;
  };

export type ExpiryFilters = { from: string; to: string; branch: string; section: string; scope: string; state: string; review: string; search: string };
export function filterExpiryRecords(records: ExpiryRecord[], filters: ExpiryFilters) {
  return records.filter((record) => {
    const searchable = `${record.product_name} ${record.notes ?? ""}`.toLowerCase();
    const state = record.expiry_state || (record as ExpiryRecord & { status?: string }).status || "";
    const reviewStatus = record.review_status || "pending";
    return (!filters.from || record.expiry_date >= filters.from) && (!filters.to || record.expiry_date <= filters.to) && (filters.branch === "all" || record.branch_id === filters.branch) && (filters.section === "all" || record.section === filters.section) && (filters.scope === "all" || record.deduction_scope === filters.scope) && (filters.state === "all" || state === filters.state) && (filters.review === "all" || reviewStatus === filters.review) && (!filters.search || searchable.includes(filters.search.toLowerCase()));
  });
}
export function buildExpiryWorkbook(XLSX: typeof XLSXType, filteredRecords: ExpiryRecord[], branches: { id: string; name_ar: string }[]) {
  const branchName = (id: string) => branches.find(branch => branch.id === id)?.name_ar ?? "-";
    const rows = filteredRecords.map((record) => ({
      "الفرع": branchName(record.branch_id),
      "القسم": record.section,
      "المنتجات المنتهية / التزوير / التدوير": record.product_name,
      "التاريخ": record.expiry_date,
      "العدد": record.quantity ?? "",
      "الخصم": record.deduction_percentage ? `${record.deduction_percentage}%` : "",
      "نوع الخصم": record.deduction_scope === "section" ? "قسم" : "فرع",
      "الحالة": record.expiry_state,
      "حالة المراجعة": record.review_status === "reviewed" ? "تمت مراجعتها" : "لم تتم مراجعتها",
      "ملاحظات": record.notes ?? "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!dir"] = "rtl";
    sheet["!views"] = [{ RTL: true }];
    sheet["!cols"] = [18, 20, 36, 14, 10, 12, 14, 28, 14, 20, 32].map((wch) => ({ wch }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "الإكسبيرات");
  return workbook;
}
