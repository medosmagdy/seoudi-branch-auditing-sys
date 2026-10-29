import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { AppRole } from "./permissions";
export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  active: boolean;
  role: AppRole;
  isAdmin: boolean;
}
export function resolveUserProfile(
  user: Pick<User, "id" | "email" | "user_metadata">,
  profile: { full_name: string | null; active: boolean | null } | null,
  savedRole: string | undefined,
): UserProfile {
  if (!profile) throw new Error("ملف الحساب غير متاح؛ أعد المحاولة أو تواصل مع مسؤول النظام");
  const role = savedRole === "admin" || savedRole === "manager" ? savedRole : "auditor";
  const active = profile.active === true;
  const metadataName =
    typeof user.user_metadata["full_name"] === "string" ? user.user_metadata["full_name"] : "";
  return {
    id: user.id,
    full_name: profile.full_name || metadataName || user.email?.split("@")[0] || "مستخدم",
    email: user.email || null,
    active,
    role,
    isAdmin: active && role === "admin",
  };
}
export async function loadSessionProfile(): Promise<UserProfile | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.user) return null;
  const user = session.user;
  const [profile, role] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, active")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
  ]);
  if (profile.error) throw profile.error;
  if (role.error) throw role.error;
  return resolveUserProfile(user, profile.data, role.data?.role);
}
export type SessionState = {
  profile: UserProfile | null;
  error: string | null;
  isLoading: boolean;
};

// A slower response from a previous account must never restore privileges after
// logout or replace the current account. Disposed providers cannot publish state.
export class SessionLoader {
  private generation = 0;
  private disposed = false;
  constructor(
    private loadProfile: () => Promise<UserProfile | null>,
    private publish: (state: SessionState) => void,
  ) {}
  async load(): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.generation;
    try {
      const profile = await this.loadProfile();
      if (!this.disposed && generation === this.generation)
        this.publish({ profile, error: null, isLoading: false });
    } catch (error) {
      if (!this.disposed && generation === this.generation)
        this.publish({
          profile: null,
          error: error instanceof Error ? error.message : "تعذر تحميل الحساب؛ أعد المحاولة",
          isLoading: false,
        });
    }
  }
  clear() {
    this.generation++;
    if (!this.disposed) this.publish({ profile: null, error: null, isLoading: false });
  }
  dispose() {
    this.disposed = true;
    this.generation++;
  }
}
