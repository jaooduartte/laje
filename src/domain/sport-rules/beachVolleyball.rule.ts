import {
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
} from "@/lib/enums";
import type { PlatformSportRule } from "@/domain/sport-rules/sportRule.types";

export const BEACH_VOLLEYBALL_RULE: PlatformSportRule = {
  sportName: "Vôlei de Praia",
  naipeMode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
  pointsWin: 3,
  pointsDraw: 0,
  pointsLoss: 0,
  resultRule: ChampionshipSportResultRule.SETS,
  defaultMatchDurationMinutes: 45,
  tieBreakerRule: ChampionshipSportTieBreakerRule.POINTS_AVERAGE,
  supportsCards: false,
  tieBreakerPriority: ["Confronto direto", "Pontos average", "Sorteio"],
};
