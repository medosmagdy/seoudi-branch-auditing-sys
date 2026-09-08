import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    Users,
    ShieldCheck,
    UserCheck,
    Search,
    Loader2,
    Mail,
    Calendar,
    Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ProfileItem {
    id: string;
    full_name: string;
    email: string;
    role: "admin" | "auditor";
    created_at?: string;
}

export function UserManager() {
    const { profile: currentProfile, refresh: refreshSession } = useSession();
    const queryClient = useQueryClient();

    const [search, setSearch] = useState("");
    const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
    const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

    // جلب المستخدمين ودمج بياناتهم مع الرتب من user_roles
    const { data: users, isLoading } = useQuery({
        queryKey: ["admin-users-list"],
        queryFn: async () => {
            const [profilesRes, rolesRes] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("id, full_name, email, created_at, active")
                    .neq("active", false),
                supabase.from("user_roles").select("user_id, role"),
            ]);

            if (profilesRes.error) {
                console.error("Fetch profiles error:", profilesRes.error);
                toast.error("فشل جلب المستخدمين: " + profilesRes.error.message);
                throw profilesRes.error;
            }

            const rolesMap = new Map<string, "admin" | "auditor">();
            (rolesRes.data || []).forEach((r: any) => {
                rolesMap.set(r.user_id, r.role as "admin" | "auditor");
            });

            return (profilesRes.data || []).map((p: any): ProfileItem => {
                const role = rolesMap.get(p.id) || "auditor";
                return {
                    id: p.id,
                    full_name: p.full_name || p.email?.split("@")[0] || "مستخدم",
                    email: p.email || "",
                    role,
                    created_at: p.created_at,
                };
            });
        },
        staleTime: 0,
        refetchOnMount: "always",
    });

    // تحديث رتبة المستخدم في user_roles
    const updateUserRole = async (userId: string, newRole: "admin" | "auditor") => {
        if (userId === currentProfile?.id && newRole !== "admin") {
            toast.error("لا يمكنك تخفيض صلاحية حسابك الحالي بنفسك!");
            return;
        }

        setUpdatingUserId(userId);

        try {
            const { error } = await supabase.from("user_roles").upsert(
                {
                    user_id: userId,
                    role: newRole,
                } as never,
                { onConflict: "user_id" }
            );

            if (error) throw error;

            toast.success(
                `تم تحويل المستخدم إلى ${newRole === "admin" ? "مدير نظام (Admin)" : "مفتش (Auditor)"}`
            );

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["admin-users-list"] }),
                queryClient.invalidateQueries({ queryKey: ["session"] }),
                refreshSession?.(),
            ]);

            if (userId === currentProfile?.id) {
                setTimeout(() => window.location.reload(), 300);
            }
        } catch (err: any) {
            console.error("Update role error:", err);
            toast.error("تعذر تحديث الصلاحية: " + (err?.message || "خطأ غير معروف"));
        } finally {
            setUpdatingUserId(null);
        }
    };

    // حذف الحساب بالكامل من الجذور
    const handleDeleteUser = async (userId: string) => {
        if (userId === currentProfile?.id) {
            toast.error("لا يمكنك حذف حسابك الحالي!");
            return;
        }

        setDeletingUserId(userId);

        try {
            const { error: rpcError } = await (supabase.rpc as any)("delete_user_completely", {
                target_user_id: userId,
            });

            if (rpcError) {
                // Fallback في حال تعثر الـ RPC
                await supabase.from("user_roles").delete().eq("user_id", userId);
                await supabase.from("profiles").delete().eq("id", userId);
            }

            toast.success("تم إزالة المستخدم وحظر دخوله نهائياً");

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["admin-users-list"] }),
                queryClient.refetchQueries({ queryKey: ["admin-users-list"] }),
            ]);
        } catch (err: any) {
            console.error("Delete user error:", err);
            toast.error("تعذر حذف الحساب: " + (err?.message || "خطأ غير معروف"));
        } finally {
            setDeletingUserId(null);
        }
    };

    const filteredUsers = useMemo(() => {
        if (!users) return [];
        if (!search.trim()) return users;
        const term = search.toLowerCase();
        return users.filter(
            (u) =>
                u.full_name?.toLowerCase().includes(term) ||
                u.email?.toLowerCase().includes(term)
        );
    }, [users, search]);

    const stats = useMemo(() => {
        if (!users) return { total: 0, admins: 0, auditors: 0 };
        const admins = users.filter((u) => u.role === "admin").length;
        return {
            total: users.length,
            admins,
            auditors: users.length - admins,
        };
    }, [users]);

    if (isLoading) {
        return (
            <div
                className="surface-card p-12 text-center rounded-2xl border border-border flex flex-col items-center justify-center gap-2"
                dir="rtl"
            >
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground font-medium">
                    جاري تحميل قائمة الحسابات...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4" dir="rtl">
            <div className="surface-card p-5 rounded-2xl border border-border shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                    <div className="space-y-1">
                        <h3 className="text-base font-black flex items-center gap-2 text-foreground">
                            <Users className="size-5 text-primary" />
                            إدارة المستخدمين والصلاحيات
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            التحكم في أدوار الحسابات، صلاحيات النظام، وإزالة المستخدمين نهائياً
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs py-1 px-2.5 bg-background">
                            الإجمالي: {stats.total}
                        </Badge>
                        <Badge
                            variant="secondary"
                            className="text-xs py-1 px-2.5 bg-primary/10 text-primary border-primary/20"
                        >
                            مديرين: {stats.admins}
                        </Badge>
                        <Badge variant="secondary" className="text-xs py-1 px-2.5">
                            مفتشين: {stats.auditors}
                        </Badge>
                    </div>
                </div>

                <div className="relative max-w-sm">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="بحث بالاسم أو البريد الإلكتروني..."
                        className="h-9 pr-9 pl-3 text-xs bg-muted/20 border-border/70 rounded-xl"
                    />
                </div>

                <div className="space-y-2.5">
                    {filteredUsers.length === 0 ? (
                        <div className="p-8 text-center text-xs text-muted-foreground rounded-xl border border-dashed border-border">
                            لا توجد حسابات مسجلة.
                        </div>
                    ) : (
                        filteredUsers.map((u) => {
                            const isSelf = u.id === currentProfile?.id;
                            const isUpdating = updatingUserId === u.id;
                            const isDeleting = deletingUserId === u.id;
                            const isAdmin = u.role === "admin";

                            return (
                                <div
                                    key={u.id}
                                    className={`flex flex-wrap items-center justify-between p-3.5 rounded-xl border transition-all gap-3 ${isSelf
                                            ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                                            : "border-border/70 bg-card hover:bg-muted/30"
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={`size-9 rounded-full flex items-center justify-center font-bold text-xs uppercase ${isAdmin
                                                    ? "bg-primary/20 text-primary"
                                                    : "bg-muted text-muted-foreground"
                                                }`}
                                        >
                                            {u.full_name[0] || u.email?.[0] || "U"}
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-sm text-foreground">
                                                    {u.full_name}
                                                </span>
                                                {isSelf && (
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-[10px] px-1.5 py-0 font-bold bg-primary/20 text-primary border-transparent"
                                                    >
                                                        أنت
                                                    </Badge>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                                <span className="flex items-center gap-1 font-mono text-[11px]" dir="ltr">
                                                    <Mail className="size-3 text-muted-foreground/70" />
                                                    {u.email}
                                                </span>
                                                {u.created_at && (
                                                    <span className="flex items-center gap-1 text-[11px]">
                                                        <Calendar className="size-3 text-muted-foreground/70" />
                                                        {new Date(u.created_at).toLocaleDateString("ar-EG")}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 mr-auto">
                                        <div className="w-40">
                                            <Select
                                                disabled={isUpdating || isDeleting}
                                                value={u.role}
                                                onValueChange={(val: "admin" | "auditor") =>
                                                    updateUserRole(u.id, val)
                                                }
                                            >
                                                <SelectTrigger className="h-8 text-xs font-semibold rounded-lg bg-background">
                                                    {isUpdating ? (
                                                        <span className="flex items-center gap-1.5 text-muted-foreground">
                                                            <Loader2 className="size-3 animate-spin" /> جاري الحفظ...
                                                        </span>
                                                    ) : (
                                                        <SelectValue />
                                                    )}
                                                </SelectTrigger>
                                                <SelectContent dir="rtl">
                                                    <SelectItem value="admin" className="text-xs font-bold text-primary">
                                                        <span className="flex items-center gap-1.5">
                                                            <ShieldCheck className="size-3.5 text-primary" /> مدير نظام (Admin)
                                                        </span>
                                                    </SelectItem>
                                                    <SelectItem value="auditor" className="text-xs font-medium">
                                                        <span className="flex items-center gap-1.5">
                                                            <UserCheck className="size-3.5 text-muted-foreground" /> مفتش (Auditor)
                                                        </span>
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {!isSelf && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        disabled={isDeleting || isUpdating}
                                                        className="size-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                                        title="حذف الحساب نهائياً"
                                                    >
                                                        {isDeleting ? (
                                                            <Loader2 className="size-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="size-4" />
                                                        )}
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent dir="rtl" className="max-w-md">
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle className="text-base font-bold text-destructive">
                                                            هل أنت متأكد من حذف هذا الحساب نهائياً؟
                                                        </AlertDialogTitle>
                                                        <AlertDialogDescription className="text-xs text-muted-foreground">
                                                            سيتم إزالة حساب <strong>{u.full_name}</strong> ({u.email}) نهائياً من النظام، ولن يتمكن من الدخول مرة أخرى.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter className="flex-row-reverse gap-2">
                                                        <AlertDialogAction
                                                            onClick={() => handleDeleteUser(u.id)}
                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-bold"
                                                        >
                                                            نعم، احذف الحساب نهائياً
                                                        </AlertDialogAction>
                                                        <AlertDialogCancel className="text-xs">إلغاء</AlertDialogCancel>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}