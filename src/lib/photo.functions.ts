import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const upload = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("audit"),
    recordId: z.string().uuid(),
    questionId: z.string().uuid(),
  }),
  z.object({ scope: z.literal("expiry"), recordId: z.string().uuid() }),
]);
// All privileged imports are inside handlers; none are shipped to the browser.
export const photoUploadServerFn = createServerFn({ method: "POST" })
  .validator(upload)
  .handler(async ({ data }) => {
    const [{ getRequestHeader }, { supabaseAdmin }, { createPhotoUpload }] = await Promise.all([
      import("@tanstack/react-start/server"),
      import("@/integrations/supabase/client.server"),
      import("./photo-storage.server"),
    ]);
    return createPhotoUpload(
      supabaseAdmin,
      getRequestHeader("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1],
      data,
    );
  });
export const registerPhotoServerFn = createServerFn({ method: "POST" })
  .validator(z.object({ upload, path: z.string().max(512) }))
  .handler(async ({ data }) => {
    const [{ getRequestHeader }, { supabaseAdmin }, { registerPhoto }] = await Promise.all([
      import("@tanstack/react-start/server"),
      import("@/integrations/supabase/client.server"),
      import("./photo-storage.server"),
    ]);
    return registerPhoto(
      supabaseAdmin,
      getRequestHeader("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1],
      data,
    );
  });
export const deletePhotoServerFn = createServerFn({ method: "POST" })
  .validator(z.object({ photoId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const [{ getRequestHeader }, { supabaseAdmin }, { removePhoto }] = await Promise.all([
      import("@tanstack/react-start/server"),
      import("@/integrations/supabase/client.server"),
      import("./photo-storage.server"),
    ]);
    return removePhoto(
      supabaseAdmin,
      getRequestHeader("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1],
      data.photoId,
    );
  });
