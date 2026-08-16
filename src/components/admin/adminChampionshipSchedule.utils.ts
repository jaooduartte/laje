interface ReverseMatchOrderDayOption {
  event_date: string;
  courts: Array<{ id: string }>;
}

export interface ReverseMatchOrderChange {
  match_id: string;
  match_number?: number | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface ReverseMatchOrderCourtChangeGroup {
  key: string;
  label: string;
  changes: ReverseMatchOrderChange[];
}

function resolveSnapshotText(snapshot: Record<string, unknown>, field: string): string | null {
  const value = snapshot[field];
  return typeof value === "string" && value.trim() ? value : null;
}

function resolveSnapshotPosition(snapshot: Record<string, unknown>): number {
  const courtSequencePosition = snapshot.court_sequence_position;
  if (typeof courtSequencePosition === "number") return courtSequencePosition;

  const scheduledSlot = snapshot.scheduled_slot;
  if (typeof scheduledSlot === "number") return scheduledSlot;

  const queuePosition = snapshot.queue_position;
  if (typeof queuePosition === "number") return queuePosition;

  return Number.MAX_SAFE_INTEGER;
}

export function resolveReverseMatchOrderCourtPosition(
  snapshot: Record<string, unknown>,
  fallbackPosition: number,
): number {
  const courtSequencePosition = snapshot.court_sequence_position;
  return typeof courtSequencePosition === "number" && courtSequencePosition > 0
    ? courtSequencePosition
    : fallbackPosition;
}

export function resolveReverseMatchOrderCourtIds(
  days: ReverseMatchOrderDayOption[],
  scheduledDate: string,
): string[] {
  return days
    .find((day) => day.event_date === scheduledDate)
    ?.courts.map((court) => court.id) ?? [];
}

export function groupReverseMatchOrderChangesByCourt(
  changes: ReverseMatchOrderChange[],
): ReverseMatchOrderCourtChangeGroup[] {
  const groups = new Map<string, ReverseMatchOrderCourtChangeGroup>();

  changes.forEach((change) => {
    const location = resolveSnapshotText(change.after, "location")
      ?? resolveSnapshotText(change.before, "location")
      ?? "Local não informado";
    const court = resolveSnapshotText(change.after, "court_name")
      ?? resolveSnapshotText(change.before, "court_name")
      ?? "Quadra não informada";
    const key = `${location}\u0000${court}`;
    const group = groups.get(key) ?? { key, label: `${location} • ${court}`, changes: [] };

    group.changes.push(change);
    groups.set(key, group);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      changes: [...group.changes].sort((left, right) => {
        const positionDifference = resolveSnapshotPosition(left.before) - resolveSnapshotPosition(right.before);
        if (positionDifference !== 0) return positionDifference;

        const leftStartTime = resolveSnapshotText(left.before, "start_time") ?? "";
        const rightStartTime = resolveSnapshotText(right.before, "start_time") ?? "";
        return leftStartTime.localeCompare(rightStartTime) || left.match_id.localeCompare(right.match_id);
      }),
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
}
