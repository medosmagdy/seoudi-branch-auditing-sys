import { supabase } from "@/integrations/supabase/client";
import {
  correctionPermissionFn,
  correctionRecipientsFn,
  ncrAnalysisFn,
  ncrBranchesFn,
  ncrRecipientsFn,
  saveCorrectionPermissionFn,
} from "./report-feature.functions";
import type { NcrFilters } from "./ncr-management";
import type { EmailAccessSettings } from "./audit-email-access";

async function headers() {
  let {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
    error = refreshed.error;
  }
  if (error || !session?.access_token) throw new Error("سجّل الدخول مرة أخرى");
  return { Authorization: `Bearer ${session.access_token}` };
}
export const loadCorrectionEmailAccess = async () =>
  correctionPermissionFn({ headers: await headers() });
export const saveCorrectionEmailAccess = async (data: EmailAccessSettings) =>
  saveCorrectionPermissionFn({ data, headers: await headers() });
export const loadCorrectionRecipients = async (auditId: string) =>
  correctionRecipientsFn({ data: { auditId }, headers: await headers() });
export const loadNcrBranches = async () => ncrBranchesFn({ headers: await headers() });
export const loadNcrAnalysis = async (data: NcrFilters) =>
  ncrAnalysisFn({ data, headers: await headers() });
export const loadNcrRecipients = async (branchId: string) =>
  ncrRecipientsFn({ data: { branchId }, headers: await headers() });
