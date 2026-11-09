import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
export const updateUserRoleServerFn = createServerFn({ method: "POST" })
  .validator(
    z.object({ userId: z.string().uuid(), newRole: z.enum(["admin", "manager", "auditor"]) }),
  )
  .handler(async ({ data }) => {
    const [{ getRequestHeader }, { supabaseAdmin }, { changeUserRole }] = await Promise.all([
      import("@tanstack/react-start/server"),
      import("@/integrations/supabase/client.server"),
      import("./admin-roles.server"),
    ]);
    const token = getRequestHeader("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    return changeUserRole(supabaseAdmin, token, data);
  });

export const setUserPasswordServerFn = createServerFn({ method: "POST" })
  .validator(z.object({ userId: z.string().uuid(), password: z.string().min(8).max(72) }))
  .handler(async ({ data }) => {
    const [{ getRequestHeader }, { supabaseAdmin }, { setUserPassword }] = await Promise.all([
      import("@tanstack/react-start/server"),
      import("@/integrations/supabase/client.server"),
      import("./admin-password.server"),
    ]);
    const token = getRequestHeader("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    return setUserPassword(supabaseAdmin, token, data);
  });
