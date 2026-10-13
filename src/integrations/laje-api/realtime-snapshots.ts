import { lajeApiRequest } from "./client";

export type AwsRealtimeSnapshot =
  | "pending-award-draws"
  | "pending-tie-breaks"
  | "interlaje-competition-standings"
  | "interlaje-overall-standings"
  | "awards-rankings"
  | "corrected-group-standings"
  | "resolved-tie-break-orders"
  | "yellow-card-discipline"
  | "interlaje-position-points"
  | "competition-disqualifications";

export interface AwsRealtimeSnapshotScope {
  seasonYear?: number | null;
  bracketEditionId?: string | null;
  sportId?: string;
  naipe?: string;
  division?: string | null;
}

/**
 * Only available in the Vercel laje-tcc AWS build. The laje/Supabase bundle
 * uses its unchanged supabase.rpc flows and cannot invoke this client.
 */
export async function fetchAwsRealtimeSnapshot<Result>(
  championshipId: string,
  snapshot: AwsRealtimeSnapshot,
  scope: AwsRealtimeSnapshotScope = {},
): Promise<Result> {
  const query = new URLSearchParams();
  if (scope.seasonYear != null) query.set("seasonYear", String(scope.seasonYear));
  if (scope.bracketEditionId) query.set("bracketEditionId", scope.bracketEditionId);
  if (scope.sportId) query.set("sportId", scope.sportId);
  if (scope.naipe) query.set("naipe", scope.naipe);
  if (scope.division) query.set("division", scope.division);
  const suffix = query.size ? `?${query.toString()}` : "";
  const { data } = await lajeApiRequest<{ data: Result }>(
    `/realtime-read/${encodeURIComponent(championshipId)}/${snapshot}${suffix}`,
  );
  return data;
}
