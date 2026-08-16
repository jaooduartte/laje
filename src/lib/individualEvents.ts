import { resolveNormalizedSportName } from "@/lib/championship";
import {
  ChampionshipIndividualEntryStatus,
  ChampionshipIndividualEventKind,
  ChampionshipIndividualEventStatus,
  ChampionshipIndividualSessionStatus,
  MatchNaipe,
} from "@/lib/enums";
import type {
  ChampionshipIndividualEvent,
  ChampionshipIndividualEventEntry,
  ChampionshipIndividualSession,
  ChampionshipIndividualTeamStanding,
  Sport,
} from "@/lib/types";

export const INDIVIDUAL_SPORT_NORMALIZED_NAMES = new Set(["atletismo", "natacao"]);

export const INDIVIDUAL_EVENT_STATUS_LABELS: Record<ChampionshipIndividualEventStatus, string> = {
  [ChampionshipIndividualEventStatus.DRAFT]: "Rascunho",
  [ChampionshipIndividualEventStatus.SCHEDULED]: "Agendada",
  [ChampionshipIndividualEventStatus.FINISHED]: "Finalizada",
  [ChampionshipIndividualEventStatus.CANCELLED]: "Cancelada",
};

export const INDIVIDUAL_SESSION_STATUS_LABELS: Record<ChampionshipIndividualSessionStatus, string> = {
  [ChampionshipIndividualSessionStatus.DRAFT]: "Rascunho",
  [ChampionshipIndividualSessionStatus.SCHEDULED]: "Agendada",
  [ChampionshipIndividualSessionStatus.LIVE]: "Ao vivo",
  [ChampionshipIndividualSessionStatus.FINISHED]: "Encerrada",
  [ChampionshipIndividualSessionStatus.CANCELLED]: "Cancelada",
};

export const INDIVIDUAL_ENTRY_STATUS_LABELS: Record<ChampionshipIndividualEntryStatus, string> = {
  [ChampionshipIndividualEntryStatus.PENDING]: "Pendente",
  [ChampionshipIndividualEntryStatus.CONFIRMED]: "Confirmado",
  [ChampionshipIndividualEntryStatus.WALKOVER]: "W.O.",
  [ChampionshipIndividualEntryStatus.DNS]: "W.O.",
  [ChampionshipIndividualEntryStatus.DSQ]: "Desclassificado",
  [ChampionshipIndividualEntryStatus.CANCELLED]: "Cancelado",
  [ChampionshipIndividualEntryStatus.DSQ_OVER_LIMIT]: "Desclassificado por excesso de provas",
};

export const INDIVIDUAL_EVENT_KIND_LABELS: Record<ChampionshipIndividualEventKind, string> = {
  [ChampionshipIndividualEventKind.INDIVIDUAL]: "Individual",
  [ChampionshipIndividualEventKind.RELAY]: "Revezamento",
};

export const INDIVIDUAL_EVENT_OFFICIAL_LABELS: Record<string, string> = {
  ATHLETICS_100M: "100m",
  ATHLETICS_400M: "400m",
  ATHLETICS_4X100: "4x100",
  ATHLETICS_SHOT_PUT: "Arremesso de peso",
  ATHLETICS_LONG_JUMP: "Salto em distância",
  SWIMMING_50_FREE: "50m livre",
  SWIMMING_50_BACK: "50m costas",
  SWIMMING_50_FLY: "50m borboleta",
  SWIMMING_50_BREAST: "50m peito",
  SWIMMING_4X50_FREE: "4x50 livre",
};

export function isIndividualSportName(sportName: string | null | undefined) {
  return INDIVIDUAL_SPORT_NORMALIZED_NAMES.has(resolveNormalizedSportName(sportName));
}

export function isIndividualSportId(sportId: string | null | undefined, sports: Sport[]) {
  if (!sportId) {
    return false;
  }

  const sport = sports.find((candidateSport) => candidateSport.id == sportId);
  return isIndividualSportName(sport?.name);
}

export function resolveIndividualSportIds(sports: Sport[]) {
  return sports
    .filter((sport) => isIndividualSportName(sport.name))
    .map((sport) => sport.id);
}

export function resolveIndividualSportStandingsSortValue(standing: ChampionshipIndividualTeamStanding | ChampionshipIndividualEventEntry | null | undefined) {
  if (!standing) {
    return 0;
  }

  if ("total_points" in standing) {
    return standing.total_points;
  }

  return standing.points_awarded;
}

export function resolveIndividualStandingPlacementCount(
  standing: ChampionshipIndividualTeamStanding,
  placement: number,
) {
  switch (placement) {
    case 1: return standing.first_places;
    case 2: return standing.second_places;
    case 3: return standing.third_places;
    case 4: return standing.fourth_places;
    case 5: return standing.fifth_places;
    case 6: return standing.sixth_places;
    case 7: return standing.seventh_places;
    case 8: return standing.eighth_places;
    case 9: return standing.ninth_places;
    case 10: return standing.tenth_places;
    case 11: return standing.eleventh_places;
    case 12: return standing.twelfth_places;
    case 13: return standing.thirteenth_places;
    case 14: return standing.fourteenth_places;
    case 15: return standing.fifteenth_places;
    case 16: return standing.sixteenth_places;
    case 17: return standing.seventeenth_places;
    case 18: return standing.eighteenth_places;
    case 19: return standing.nineteenth_places;
    case 20: return standing.twentieth_places;
    default: return 0;
  }
}

export function resolveIndividualEventContextLabel(event: Pick<ChampionshipIndividualEvent, "name" | "naipe">) {
  return `${event.name} • ${event.naipe == MatchNaipe.MASCULINO ? "Masculino" : event.naipe == MatchNaipe.FEMININO ? "Feminino" : "Misto"}`;
}

export function resolveIndividualSessionContextLabel(
  session: Pick<ChampionshipIndividualSession, "naipe"> & {
    sports?: Pick<Sport, "name"> | null;
  },
) {
  const sportName = session.sports?.name ?? "Modalidade individual";
  const naipeLabel =
    session.naipe == MatchNaipe.MASCULINO
      ? "Masculino"
      : session.naipe == MatchNaipe.FEMININO
        ? "Feminino"
        : "Misto";

  return `${sportName} • ${naipeLabel}`;
}
