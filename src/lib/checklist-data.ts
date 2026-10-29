import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "./query-pages";
import type { AppDatabase } from "@/integrations/supabase/app-schema";

type Header = AppDatabase["public"]["Tables"]["headers"]["Row"];
export function loadChecklistTypes(signal?: AbortSignal) {
  return readAllPages((from, to) => {
    const query = supabase
      .from("audit_types")
      .select("*")
      .order("name_ar")
      .order("id")
      .range(from, to);
    return signal ? query.abortSignal(signal) : query;
  }, signal);
}
export async function loadChecklistTree(typeId: string, signal?: AbortSignal) {
  const [sections, questions] = await Promise.all([
    readAllPages((from, to) => {
      const query = supabase
        .from("sections")
        .select("*")
        .eq("audit_type_id", typeId)
        .order("order_index")
        .order("id")
        .range(from, to);
      return signal ? query.abortSignal(signal) : query;
    }, signal),
    readAllPages((from, to) => {
      const query = supabase
        .from("questions")
        .select("*")
        .eq("audit_type_id", typeId)
        .order("item_order")
        .order("id")
        .range(from, to);
      return signal ? query.abortSignal(signal) : query;
    }, signal),
  ]);
  const headers: Header[] = [];
  for (let index = 0; index < sections.length; index += 100) {
    const ids = sections.slice(index, index + 100).map((section) => section.id);
    headers.push(
      ...(await readAllPages((from, to) => {
        const query = supabase
          .from("headers")
          .select("*")
          .in("section_id", ids)
          .order("order_index")
          .order("id")
          .range(from, to);
        return signal ? query.abortSignal(signal) : query;
      }, signal)),
    );
  }
  headers.sort((a, b) => a.order_index - b.order_index || a.id.localeCompare(b.id));
  return { sections, headers, questions };
}
