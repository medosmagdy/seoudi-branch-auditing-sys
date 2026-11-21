import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ncrFiltersSchema } from "./ncr-management";

async function signedActor() {
  const [{ getRequestHeader }, { supabaseAdmin }, { requireServerActor }] = await Promise.all([
    import("@tanstack/react-start/server"),
    import("@/integrations/supabase/client.server"),
    import("./server-access.server"),
  ]);
  const token = getRequestHeader("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  return { db: supabaseAdmin, actor: await requireServerActor(supabaseAdmin, token) };
}

export const correctionPermissionFn = createServerFn({ method: "POST" }).handler(async () => {
  const { db, actor } = await signedActor();
  const { correctionPermission } = await import("./correction-email.server");
  return correctionPermission(db, actor);
});
export const saveCorrectionPermissionFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      roles: z.array(z.enum(["admin", "manager", "auditor"])).max(3),
      user_ids: z.array(z.string().uuid()).max(500),
    }),
  )
  .handler(async ({ data }) => {
    const { db, actor } = await signedActor();
    const { saveCorrectionPermission } = await import("./correction-email.server");
    return saveCorrectionPermission(db, actor, data);
  });
export const correctionRecipientsFn = createServerFn({ method: "POST" })
  .validator(z.object({ auditId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { db, actor } = await signedActor();
    const { correctionRecipients } = await import("./correction-email.server");
    return correctionRecipients(db, actor, data.auditId);
  });

export const ncrBranchesFn = createServerFn({ method: "POST" }).handler(async () => {
  const { db, actor } = await signedActor();
  const { ncrBranches } = await import("./ncr-management.server");
  return ncrBranches(db, actor);
});
export const ncrAnalysisFn = createServerFn({ method: "POST" })
  .validator(ncrFiltersSchema)
  .handler(async ({ data }) => {
    const { db, actor } = await signedActor();
    const { ncrAnalysis } = await import("./ncr-management.server");
    return ncrAnalysis(db, actor, data);
  });
export const ncrRecipientsFn = createServerFn({ method: "POST" })
  .validator(z.object({ branchId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { db, actor } = await signedActor();
    const { ncrRecipients } = await import("./ncr-management.server");
    return ncrRecipients(db, actor, data.branchId);
  });
