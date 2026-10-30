import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
// Privileged SDK/client imports remain in the server handler only.
export const maintenancePhotoServerFn = createServerFn({ method: "POST" })
  .validator(z.unknown())
  .handler(async ({ data }) => {
    const [{ getRequestHeader }, { supabaseAdmin }, { maintenancePhotoOperation }] =
      await Promise.all([
        import("@tanstack/react-start/server"),
        import("@/integrations/supabase/client.server"),
        import("./maintenance-photos.server"),
      ]);
    return maintenancePhotoOperation(
      supabaseAdmin,
      getRequestHeader("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1],
      data,
    );
  });
