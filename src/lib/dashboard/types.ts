import type { Tables } from "@/integrations/supabase/types";

export type AuditRow = Tables<"audits">;
export type BranchRow = Tables<"branches">;
export type AuditTypeRow = Tables<"audit_types">;
export type SectionRow = Tables<"sections">;
export type QuestionRow = Tables<"questions">;
export type AuditAnswerRow = Tables<"audit_answers">;

export type DashboardAudit = AuditRow & {
  branchName: string;
  branchCode: string;
  typeName: string;
  typeCode: string;
  auditorName: string;
};

export type DashboardAuditScore = DashboardAudit & {
  score: number | null;
};
