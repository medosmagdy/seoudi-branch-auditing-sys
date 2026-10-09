import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ImagePlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated/expiry")({ component: ExpiryPage });

function ExpiryPage() {
  const { isAdmin } = useSession();
  const { data: branches = [] } = useQuery({
    queryKey: ["expiry-branches"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: sections = [] } = useQuery({
    queryKey: ["expiry-sections"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("sections").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!isAdmin) return <AppShell title="تسجيل الإكسبيرات"><p className="text-muted-foreground">هذه الصفحة متاحة للمديرين فقط.</p></AppShell>;

  return <AppShell title="تسجيل الإكسبيرات" subtitle="تسجيل ومتابعة الإكسبيرات حسب الشهر والفرع والقسم">
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader><CardTitle>إضافة إكسباير</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-2"><Label htmlFor="expiry-date">التاريخ</Label><Input id="expiry-date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
            <div className="flex flex-col gap-2"><Label>الفرع</Label><Select><SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger><SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex flex-col gap-2"><Label>القسم</Label><Select><SelectTrigger><SelectValue placeholder="اختر القسم" /></SelectTrigger><SelectContent>{sections.map((section) => <SelectItem key={section.id} value={section.id}>{section.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex flex-col gap-2"><Label>الحالة</Label><Select defaultValue="open"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">مفتوح</SelectItem><SelectItem value="resolved">تمت المعالجة</SelectItem><SelectItem value="closed">مغلق</SelectItem></SelectContent></Select></div>
            <div className="flex flex-col gap-2"><Label htmlFor="deduction">الخصم %</Label><Input id="deduction" type="number" min="0" max="100" step="0.01" placeholder="0" /></div>
            <div className="flex flex-col gap-2"><Label>نوع الخصم</Label><Select defaultValue="section"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="section">خصم قسم</SelectItem><SelectItem value="branch">خصم فرع</SelectItem></SelectContent></Select></div>
            <div className="flex flex-col gap-2 md:col-span-2 lg:col-span-3"><Label htmlFor="expiry-images">صور الإكسباير</Label><label htmlFor="expiry-images" className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground hover:bg-muted/50"><ImagePlus className="size-5" /><span>إرفاق صورة أو أكثر</span><Input id="expiry-images" type="file" accept="image/*" multiple className="sr-only" /></label></div>
            <div className="lg:col-span-3"><Button type="button"><CalendarDays data-icon="inline-start" />حفظ الإكسباير</Button></div>
          </form>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>سجل الشهر الحالي</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">سيظهر هنا سجل الإكسبيرات المسجلة للشهر الحالي بعد تفعيل جدول التخزين.</p></CardContent></Card>
    </div>
  </AppShell>;
}
