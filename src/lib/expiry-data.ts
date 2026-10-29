import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "./query-pages";
import { EXPIRY_STATES, type ExpiryState, type ExpiryRecord } from "./expiry";

export type ExpiryDraft = {
  date: string;
  branch: string;
  section: string;
  product: string;
  state: ExpiryState;
  deduction: string;
  scope: string;
  quantity: string;
  notes: string;
};

export function expiryDraftValues(form: ExpiryDraft) {
  if (!form.branch || !form.section.trim() || !form.product.trim())
    throw new Error("أكمل البيانات المطلوبة");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(form.date) ||
    !Number.isFinite(Date.parse(form.date)) ||
    new Date(form.date).toISOString().slice(0, 10) !== form.date
  )
    throw new Error("أدخل تاريخًا صحيحًا");
  const deduction = form.deduction.trim() ? Number(form.deduction) : 0;
  if (!Number.isFinite(deduction) || deduction < 0 || deduction > 100)
    throw new Error("نسبة الخصم يجب أن تكون بين 0 و100%");
  const quantity = form.quantity.trim() ? Number(form.quantity) : null;
  if (quantity !== null && (!Number.isSafeInteger(quantity) || quantity < 0))
    throw new Error("عدد القطع يجب أن يكون عددًا صحيحًا غير سالب");
  if (!EXPIRY_STATES.includes(form.state) || !["section", "branch"].includes(form.scope))
    throw new Error("اختر الحالة ونوع الخصم من القائمة");
  return {
    expiry_date: form.date,
    branch_id: form.branch,
    section: form.section,
    product_name: form.product.trim(),
    expiry_state: form.state,
    deduction_percentage: deduction,
    deduction_scope: form.scope,
    quantity,
    notes: form.notes.trim() || null,
  };
}
export function loadExpiryBranches(signal?: AbortSignal) {
  return readAllPages((from, to) => {
    const query = supabase
      .from("branches")
      .select("id, name_ar")
      .order("name_ar")
      .order("id")
      .range(from, to);
    return signal ? query.abortSignal(signal) : query;
  }, signal);
}
export async function loadExpiryRecords(signal?: AbortSignal): Promise<ExpiryRecord[]> {
  const rows = await readAllPages((from, to) => {
    const query = supabase
      .from("expiry_records")
      .select("*")
      .order("expiry_date", { ascending: false })
      .order("id")
      .range(from, to);
    return signal ? query.abortSignal(signal) : query;
  }, signal);
  // The existing API schema uses strings for these legacy enum columns.
  return rows as ExpiryRecord[];
}
