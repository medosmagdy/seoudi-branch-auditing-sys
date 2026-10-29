import { useQuery } from "@tanstack/react-query";
import { useSession } from "./useSession";
import { loadSectionAccess } from "@/lib/section-access";
import { canSeeSection, type SectionId } from "@/lib/app-sections";
export function useSectionAccess() {
  const { profile } = useSession();
  const query = useQuery({
    queryKey: ["section-access", profile?.id, profile?.role],
    queryFn: loadSectionAccess,
    enabled: !!profile?.active,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => (q.state.data?.installed ? 30_000 : false),
    retry: 1,
  });
  return {
    ...query,
    canSee: (id: SectionId) =>
      !!profile?.active &&
      (profile.role === "admin" ||
        (query.isSuccess && canSeeSection(profile.role, id, query.data.overrides))),
  };
}
