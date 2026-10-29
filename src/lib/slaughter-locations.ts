import { supabase } from "@/integrations/supabase/client";
import { slaughterNameKey } from "./slaughter-model";
export type SlaughterLocationKind = "farm" | "slaughterhouse";
export function slaughterLocationOptions(names: string[]) {
  const options = new Map<string, string>();
  for (const value of names) {
    const name = value.trim().replace(/\s+/g, " ");
    if (name && !options.has(slaughterNameKey(name))) options.set(slaughterNameKey(name), name);
  }
  return [...options.values()].sort((a, b) => a.localeCompare(b, "ar"));
}
export async function loadSlaughterLocations(): Promise<
  { kind: SlaughterLocationKind; name: string }[]
> {
  const rows: { kind: SlaughterLocationKind; name: string }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await (supabase as any)
      .from("slaughter_locations")
      .select("kind,name")
      .order("kind")
      .order("name")
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return rows;
  }
}
export async function addSlaughterLocation(
  kind: SlaughterLocationKind,
  raw: string,
): Promise<string> {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) throw new Error("أدخل اسمًا من 1 إلى 120 حرفًا");
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) throw new Error("يجب تسجيل الدخول لحفظ الاسم الجديد");
  const { error } = await (supabase as any)
    .from("slaughter_locations")
    .upsert(
      { kind, name, created_by: data.user.id },
      { onConflict: "kind,name", ignoreDuplicates: true },
    );
  if (error) throw error;
  // Verify the name is readable after persistence; do not announce a local-only save.
  const result = await (supabase as any)
    .from("slaughter_locations")
    .select("name")
    .eq("kind", kind)
    .eq("name", name)
    .single();
  if (result.error) throw result.error;
  if (!result.data?.name) throw new Error("تعذر التأكد من حفظ الاسم الجديد");
  return result.data.name;
}
export function slaughterLocationError(error: unknown): string {
  const value = error as { message?: string; code?: string } | null;
  if (value?.code === "PGRST205" || value?.code === "42P01")
    return "جدول أسماء المزارع والمجازر غير مهيأ. شغّل ملف تهيئة القوائم المرفق ثم أعد المحاولة.";
  if (value?.code === "42501") return "حسابك لا يملك صلاحية إضافة الاسم؛ راجع صلاحيات الإدارة.";
  return value?.message || "تعذر حفظ الاسم؛ أعد المحاولة";
}
