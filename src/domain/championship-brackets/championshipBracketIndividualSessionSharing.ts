import { MatchNaipe, TeamDivision } from "@/lib/enums";

type IndividualSessionSharedSlotInput = {
  sport_id: string | null | undefined;
  naipe?: MatchNaipe | null | undefined;
  division?: TeamDivision | null | undefined;
  date?: string | null | undefined;
  scheduled_date?: string | null | undefined;
  start_time: string | null | undefined;
  end_time: string | null | undefined;
  location_key: string | null | undefined;
  court_key: string | null | undefined;
};

export function resolveIndividualSessionSharedSlotKey(
  input: IndividualSessionSharedSlotInput,
) {
  const date = input.scheduled_date ?? input.date ?? null;

  if (
    !input.sport_id ||
    !date ||
    !input.start_time ||
    !input.end_time ||
    !input.location_key ||
    !input.court_key
  ) {
    return null;
  }

  return [
    date,
    input.start_time,
    input.end_time,
    input.location_key,
    input.court_key,
    input.sport_id,
    input.division ?? "",
  ].join("::");
}

export function resolveCanShareIndividualSessionSlot(
  left: IndividualSessionSharedSlotInput,
  right: IndividualSessionSharedSlotInput,
) {
  if (!left.naipe || !right.naipe || left.naipe == right.naipe) {
    return false;
  }

  const leftKey = resolveIndividualSessionSharedSlotKey(left);
  const rightKey = resolveIndividualSessionSharedSlotKey(right);

  return leftKey != null && leftKey == rightKey;
}
