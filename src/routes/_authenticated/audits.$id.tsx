import { auditOwnerFilter } from "@/lib/audit-sharing";
import { useAuditSharing } from "@/hooks/useAuditSharing";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { canReadAudit } from "@/lib/permissions";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/audits/$id")({ component: AuditAccess });

function AuditAccess() {
  const { id } = Route.useParams();
  const { profile } = useSession();
  const sharing = useAuditSharing();
  const access = useQuery({
    queryKey: [
      "audit-access",
      id,
      profile?.id,
      profile?.role,
      sharing.peerIds,
      sharing.visibleBranchIds,
    ],
    enabled: !!profile && sharing.isSuccess,
    queryFn: async () => {
      let query = supabase
        .from("audits")
        .select("status, created_by, auditor_id, branch_id")
        .eq("id", id);
      if (profile?.role === "manager")
        query = query.or(
          auditOwnerFilter(profile.id, sharing.peerIds, true, sharing.visibleBranchIds),
        );
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return (
        !!data &&
        !!profile &&
        canReadAudit({
          sharedUserIds: sharing.peerIds,
          branchId: data.branch_id,
          managerBranchIds: sharing.visibleBranchIds,
          role: profile.role,
          userId: profile.id,
          status: data.status,
          createdBy: data.created_by,
          auditorId: data.auditor_id,
        })
      );
    },
    staleTime: 0,
  });
  if (sharing.isError)
    return (
      <AppShell title="تعذر التحقق من المشاركة">
        <Button onClick={() => void sharing.refetch()}>إعادة المحاولة</Button>
      </AppShell>
    );
  if (access.isPending)
    return (
      <AppShell title="جاري التحقق من صلاحية عرض الفحص">
        <p role="status">جاري التحميل…</p>
      </AppShell>
    );
  if (access.isError)
    return (
      <AppShell title="تعذر التحقق من الفحص">
        <div role="alert" className="surface-card space-y-3 p-6 text-center">
          <p>تعذر التحقق من صلاحية عرض الفحص.</p>
          <Button onClick={() => void access.refetch()}>إعادة المحاولة</Button>
        </div>
      </AppShell>
    );
  if (!access.data)
    return (
      <AppShell title="الفحص غير متاح">
        <div className="surface-card space-y-3 p-6 text-center" dir="rtl">
          <p>
            {profile?.role === "manager"
              ? "المتاح للمشرفين هو الفحوصات المعتمدة ومسوداتهم ومسودات مجموعات المشاركة الخاصة بهم."
              : "هذا الفحص غير متاح لحسابك."}
          </p>
          <Button asChild variant="outline">
            <Link to="/audits">الرجوع للفحوصات</Link>
          </Button>
        </div>
      </AppShell>
    );
  return <Outlet />;
}
