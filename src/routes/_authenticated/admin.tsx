import { createFileRoute } from "@tanstack/react-router";
import { Shield, Users, CheckSquare } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserManager } from "@/components/admin/UserManager";
import { ChecklistManager } from "@/components/admin/ChecklistManager";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "لوحة تحكم الإدارة — نظام تدقيق الفروع" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => { },
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, isLoading } = useSession();

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex h-72 items-center justify-center text-xs text-muted-foreground" dir="rtl">
          جاري التحقق من صلاحيات المدير...
        </div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="surface-card p-8 text-center space-y-2 rounded-2xl border border-border max-w-xl mx-auto my-12" dir="rtl">
          <h2 className="text-base font-bold text-destructive">هذه الصفحة مخصصة لمديري النظام فقط.</h2>
          <p className="text-xs text-muted-foreground">
            حسابك الحالي مسجل بصلاحية مفتش (Auditor). يرجى مراجعة مسؤول النظام لترقية الحساب.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
          <div className="space-y-1">
            <h1 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2">
              <Shield className="size-6 text-primary" />
              لوحة تحكم النظام والإدارة
            </h1>
            <p className="text-xs text-muted-foreground">
              إدارة صلاحيات المستخدمين، بنود التفتيش والاشتراطات، وإعدادات النظام العامة
            </p>
          </div>
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="bg-muted/40 p-1 rounded-xl border border-border/60 inline-flex">
            <TabsTrigger value="users" className="text-xs font-bold gap-2 py-2 px-4 rounded-lg">
              <Users className="size-4" />
              المستخدمين والصلاحيات
            </TabsTrigger>
            <TabsTrigger value="checklists" className="text-xs font-bold gap-2 py-2 px-4 rounded-lg">
              <CheckSquare className="size-4" />
              قوائم وبنود التفتيش
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="outline-none">
            <UserManager />
          </TabsContent>

          <TabsContent value="checklists" className="outline-none">
            <ChecklistManager />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}