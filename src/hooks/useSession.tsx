import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  loadSessionProfile,
  SessionLoader,
  type SessionState,
  type UserProfile,
} from "@/lib/session-profile";
export type { UserProfile } from "@/lib/session-profile";
interface SessionContextType extends SessionState {
  isAdmin: boolean;
  isPasswordRecovery: boolean;
  refresh: () => Promise<void>;
}
const SessionContext = createContext<SessionContextType>({
  profile: null,
  error: null,
  isLoading: true,
  isAdmin: false,
  isPasswordRecovery: false,
  refresh: async () => {},
});
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ profile: null, error: null, isLoading: true });
  const currentLoader = useRef<SessionLoader | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const refresh = useCallback(() => currentLoader.current?.load() ?? Promise.resolve(), []);
  useEffect(() => {
    const loader = new SessionLoader(loadSessionProfile, setState);
    currentLoader.current = loader;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setIsPasswordRecovery(true);
      if (event === "SIGNED_OUT") {
        setIsPasswordRecovery(false);
        loader.clear();
      } else if (event !== "INITIAL_SESSION") queueMicrotask(() => void loader.load());
    });
    void loader.load();
    return () => {
      loader.dispose();
      subscription.unsubscribe();
      if (currentLoader.current === loader) currentLoader.current = null;
    };
  }, []);
  return (
    <SessionContext.Provider
      value={{ ...state, isAdmin: state.profile?.isAdmin ?? false, isPasswordRecovery, refresh }}
    >
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  return useContext(SessionContext);
}
