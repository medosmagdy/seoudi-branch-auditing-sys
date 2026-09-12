import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Calendar, ClipboardCheck, Loader2, Store, UserCheck, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { logAuditEdit } from "@/lib/generate-reports";

export const Route = createFileRoute("/_authenticated/audits/new")({
  head: () => ({
    meta: [
      { title: "بدء فحص جديد — SAS" },
      { name: "description", content: "Create a new branch audit." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewAuditPage,
});

function NewAuditPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [branchId, setBranchId] = useState("");
  const [auditTypeId, setAuditTypeId] = useState("");
  const [auditDate, setAuditDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [auditorName, setAuditorName] = useState("");
  const [branchManager, setBranchManager] = useState("");


  // جلب بيانات المستخدم المسجل تلقائياً ووضع اسمه كـ Default
  useEffect(() => {
    async function loadUserProfile() {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", authData.user.id)
          .maybeSingle();

        const name = profile?.full_name || authData.user.user_metadata?.full_name || authData.user.email?.split("@")[0] || "";
        setAuditorName(name);
      }
    }
    loadUserProfile();
  }, []);

  // جلب الفروع المتاحة
  const { data: branches, isLoading: loadingBranches } = useQuery({
    queryKey: ["branches-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").order("name_ar");
      if (error) throw error;
      return data ?? [];
    },
  });

  // جلب أنواع التدقيق النشطة
  const { data: auditTypes, isLoading: loadingTypes } = useQuery({
    queryKey: ["audit-types-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_types").select("*").eq("active", true).order("name_ar");
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleCreateAudit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!branchId) {
      toast.error("يرجى اختيار الفرع");
      return;
    }
    if (!auditTypeId) {
      toast.error("يرجى اختيار نوع التدقيق");
      return;
    }
    if (!auditDate) {
      toast.error("يرجى تحديد تاريخ الفحص");
      return;
    }
    if (!auditorName.trim()) {
      toast.error("يرجى إدخال اسم المفتش / الأوديتور");
      return;
    }

    try {
      setSubmitting(true);

      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id ?? null;

      // تجهيز الحقول بشكل آمن ومتوافق
      const insertPayload: Record<string, any> = {
        branch_id: branchId,
        audit_type_id: auditTypeId,
        audit_date: auditDate,
        branch_manager: branchManager.trim() || null,
        status: "draft",
        version: 1,
      };

      // إضافة الـ auditor_id إذا كان المستخدم مسجلاً
      if (currentUserId) {
        insertPayload.auditor_id = currentUserId;
      }

      // محاولة الإدخال الأساسية
      let res = await supabase.from("audits").insert(insertPayload as never).select("id").single();

      // لو الجدول فيه حقل اسمه auditor_name ومطلوب
      if (res.error && res.error.message.includes("auditor_name")) {
        insertPayload.auditor_name = auditorName.trim();
        res = await supabase.from("audits").insert(insertPayload as never).select("id").single();
      }

      if (res.error) {
        // تحديث بروفايل المستخدم بالاسم المدخل لضمان ظهوره في كل التقارير
        console.error("Supabase insert error:", res.error);
        throw res.error;
      }

      const newAuditId = res.data?.id;
      if (!newAuditId) throw new Error("لم يتم إنشاء الفحص بنجاح");

      // تحديث الاسم في البروفايل لضمان قراءته في التقارير والإكسيل
      if (currentUserId && auditorName.trim()) {
        await supabase
          .from("profiles")
          .update({ full_name: auditorName.trim() } as never)
          .eq("id", currentUserId);
      }

      await logAuditEdit(newAuditId, "created", `تم إنشاء مسودة فحص جديدة بواسطة: ${auditorName.trim()}`);
      toast.success("تم بدء الفحص بنجاح!");

      navigate({ to: "/audits/$id", params: { id: newAuditId } });
    } catch (err: any) {
      console.error("Create audit failed:", err);
      toast.error("تعذر إنشاء الفحص: " + (err?.message || "خطأ في الاتصال"));
    } finally {
      setSubmitting(false);
    }
  };

  const isLoading = loadingBranches || loadingTypes;

  return (
    <AppShell title="بدء زيارة وفحص جديد" subtitle="قم بتحديد الفرع ونوع التدقيق والمفتش المسئول">
      <div className="max-w-xl mx-auto py-6" dir="rtl">
        <div className="surface-card p-6 rounded-2xl border border-border shadow-xs space-y-6">
          <div className="border-b border-border pb-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <ClipboardCheck className="size-5 text-primary" />
              بيانات التدقيق والزيارة
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              أدخل بيانات الفحص واسم المفتش ومدير الفرع لتوثيقها في تقارير الزيارة وشيتات الإكسيل.
            </p>
          </div>

          <form onSubmit={handleCreateAudit} className="space-y-4">
            {/* اختيار الفرع */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Store className="size-3.5 text-muted-foreground" /> الفرع *
              </Label>
              <Select value={branchId} onValueChange={setBranchId} disabled={isLoading || submitting}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder={loadingBranches ? "جاري تحميل الفروع…" : "اختر الفرع"} />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {branches?.map((b: any) => (
                    <SelectItem key={b.id} value={b.id} className="text-xs">
                      {b.name_ar || b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* اختيار نوع التدقيق */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <ClipboardCheck className="size-3.5 text-muted-foreground" /> نوع التدقيق
              </Label>
              <Select value={auditTypeId} onValueChange={setAuditTypeId} disabled={isLoading || submitting}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder={loadingTypes ? "جاري تحميل الأنواع…" : "اختر نوع التدقيق"} />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {auditTypes?.map((t: any) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.name_ar || t.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* اسم المفتش / الأوديتور */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <UserCheck className="size-3.5 text-muted-foreground" /> اسم المراجع / الأوديتور *
              </Label>
              <Input
                placeholder="أدخل اسم مفتش الجودة المسئول..."
                value={auditorName}
                onChange={(e) => setAuditorName(e.target.value)}
                disabled={submitting}
                className="text-xs font-medium"
              />
            </div>

            {/* تاريخ الفحص */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Calendar className="size-3.5 text-muted-foreground" /> تاريخ الفحص والزيارة *
              </Label>
              <Input
                type="date"
                value={auditDate}
                onChange={(e) => setAuditDate(e.target.value)}
                disabled={submitting}
                className="text-xs font-mono text-right"
              />
            </div>

            {/* اسم مدير الفرع */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <User className="size-3.5 text-muted-foreground" /> اسم مدير الفرع (أو القائم بالإدارة)
              </Label>
              <Input
                placeholder="أدخل اسم مدير الفرع..."
                value={branchManager}
                onChange={(e) => setBranchManager(e.target.value)}
                disabled={submitting}
                className="text-xs"
              />
            </div>

            {/* أزرار الحفظ */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: "/audits" })}
                disabled={submitting}
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || isLoading}
                className="gap-2 font-bold px-5 bg-primary text-primary-foreground"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> جاري بدء الفحص…
                  </>
                ) : (
                  <>
                    بدء التقييم <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
