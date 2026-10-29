import type { SupabaseClient } from "@supabase/supabase-js";

export const invalidPhotoSession = "الجلسة غير صالحة؛ سجّل الدخول مرة أخرى";
type PhotoAuth = Pick<SupabaseClient["auth"], "getSession" | "refreshSession">;

// Refresh is shared by concurrent photo operations; never send refresh tokens
// to application handlers or retry a mutation after a storage/database failure.
export function createPhotoAuthorization(auth: PhotoAuth) {
  let refreshing: ReturnType<PhotoAuth["refreshSession"]> | undefined;
  async function refresh() {
    refreshing ??= auth.refreshSession();
    const pending = refreshing;
    try {
      const { data, error } = await pending;
      if (error || !data.session?.access_token) throw new Error(invalidPhotoSession);
      return data.session.access_token;
    } finally {
      if (refreshing === pending) refreshing = undefined;
    }
  }
  async function headers(forceRefresh = false) {
    if (forceRefresh) return { Authorization: `Bearer ${await refresh()}` };
    const { data, error } = await auth.getSession();
    if (error || !data.session?.access_token)
      throw new Error("يجب تسجيل الدخول لرفع الصور أو حذفها");
    const session = data.session;
    const expiring =
      session.expires_at !== undefined && session.expires_at * 1000 <= Date.now() + 60_000;
    return { Authorization: `Bearer ${expiring ? await refresh() : session.access_token}` };
  }
  return { headers };
}

export async function deleteWithSessionRecovery(
  authorization: ReturnType<typeof createPhotoAuthorization>,
  remove: (headers: {
    Authorization: string;
  }) => Promise<{ success: true } | { success: false; message: string }>,
) {
  let result = await remove(await authorization.headers());
  // This rejection occurs before storage/database mutation on the server.
  if (!result.success && result.message === invalidPhotoSession)
    result = await remove(await authorization.headers(true));
  if (!result.success) throw new Error(result.message);
  return result;
}
