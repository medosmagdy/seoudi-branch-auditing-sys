import { useQuery } from "@tanstack/react-query";
import { useSession } from "./useSession";
import { EMPTY_SHARED_USERS, loadAuditSharing } from "@/lib/audit-sharing";
export function useAuditSharing() {
  const { profile } = useSession();
  const query = useQuery({
    queryKey: ["audit-sharing", profile?.id, profile?.role],
    queryFn: loadAuditSharing,
    enabled: !!profile?.active,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (query.state.data?.installed ? 30_000 : false),
    retry: 1,
  });
  return {
    ...query,
    visibleBranchIds: query.isSuccess ? query.data.visible_branch_ids : EMPTY_SHARED_USERS,
    peerIds: query.isError ? EMPTY_SHARED_USERS : (query.data?.peers ?? EMPTY_SHARED_USERS),
  };
}
