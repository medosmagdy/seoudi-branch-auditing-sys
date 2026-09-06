import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  active: boolean;
  role: "admin" | "auditor";
  isAdmin: boolean;
}

interface SessionContextType {
  profile: UserProfile | null;
  isLoading: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType>({
  profile: null,
  isLoading: true,
  isAdmin: false,
  refresh: async () => { },
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCurrentUserData = async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setProfile(null);
        return;
      }

      // جلب البروفايل والرتبة معاً
      const [profRes, roleRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, active")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const role: "admin" | "auditor" = (roleRes.data?.role as any) || "auditor";
      const isUserAdmin = role === "admin";

      const displayName =
        profRes.data?.['full_name'] ||
        user.user_metadata?.['full_name'] ||
        user.email?.split("@")[0] ||
        "مستخدم";

      setProfile({
        id: user.id,
        full_name: displayName,
        email: user.email || null,
        active: profRes.data?.['active'] ?? true,
        role,
        isAdmin: isUserAdmin,
      });
    } catch (err) {
      console.error("Session load error:", err);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUserData();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      fetchCurrentUserData();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider
      value={{
        profile,
        isLoading,
        isAdmin: profile?.isAdmin ?? false,
        refresh: fetchCurrentUserData,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}