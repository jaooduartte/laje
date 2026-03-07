import {
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
} from "@/lib/enums";
import type { PlatformSportRule } from "@/domain/sport-rules/sportRule.types";

export const BEACH_TENNIS_RULE: PlatformSportRule = {
  sportName: "Beach Tennis",
  naipeMode: ChampionshipSportNaipeMode.MISTO,
  pointsWin: 3,
  pointsDraw: 0,
  pointsLoss: 0,
  resultRule: ChampionshipSportResultRule.SETS,
  defaultMatchDurationMinutes: 35,
  tieBreakerRule: ChampionshipSportTieBreakerRule.BEACH_TENNIS,
  supportsCards: false,
  tieBreakerPriority: ["Maior número de vitórias", "Confronto direto", "Saldo dos games/sets", "Sorteio"],
};
