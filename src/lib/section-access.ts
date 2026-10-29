import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { APP_SECTIONS, type SectionOverrides } from "./app-sections";
const schema = z.object({
  overrides: z.record(z.boolean()),
  users: z.array(z.object({ user_id: z.string().uuid(), overrides: z.record(z.boolean()) })),
});
const rpc = (name: string, args?: Record<string, unknown>) =>
  (
    supabase.rpc as unknown as (
      name: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>
  )(name, args);
export async function loadSectionAccess() {
  const { data, error } = await rpc("sqop_section_access_context");
  if (error) {
    if (["PGRST202", "42883"].includes(error.code ?? ""))
      return {
        installed: false,
        overrides: {} as SectionOverrides,
        users: [] as { user_id: string; overrides: SectionOverrides }[],
      };
    throw new Error("تعذر تحميل صلاحيات السكاشن");
  }
  return { installed: true, ...schema.parse(data) };
}
export async function saveSectionAccess(userId: string, overrides: SectionOverrides) {
  z.string().uuid().parse(userId);
  if (
    Object.entries(overrides).some(
      ([id, value]) => !APP_SECTIONS.some((s) => s.id === id) || typeof value !== "boolean",
    )
  )
    throw new Error("إعدادات السكاشن غير صالحة");
  const { error } = await rpc("sqop_set_section_access", {
    p_user_id: userId,
    p_overrides: overrides,
  });
  if (error) throw new Error(error.message);
}
