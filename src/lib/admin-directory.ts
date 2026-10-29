import { supabase } from "@/integrations/supabase/client";
import { readAllPages } from "./query-pages";
import type { AppRole } from "./permissions";

export interface AdminDirectoryUser {
  id: string;
  full_name: string;
  email: string;
  role: AppRole;
  created_at?: string;
}

export async function loadAdminDirectory(signal?: AbortSignal): Promise<AdminDirectoryUser[]> {
  const [profiles, roles] = await Promise.all([
    readAllPages((from, to) => {
      const query = supabase
        .from("profiles")
        .select("id, full_name, email, created_at, active")
        .neq("active", false)
        .order("id")
        .range(from, to);
      return signal ? query.abortSignal(signal) : query;
    }, signal),
    readAllPages((from, to) => {
      const query = supabase
        .from("user_roles")
        .select("user_id, role")
        .order("user_id")
        .range(from, to);
      return signal ? query.abortSignal(signal) : query;
    }, signal),
  ]);
  const byUser = new Map(roles.map((role) => [role.user_id, role.role]));
  return profiles.map((profile) => ({
    id: profile.id,
    full_name: profile.full_name || profile.email?.split("@")[0] || "مستخدم",
    email: profile.email || "",
    role: byUser.get(profile.id) ?? "auditor",
    created_at: profile.created_at,
  }));
}
