import {
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
} from "@/lib/enums";
import type { PlatformSportRule } from "@/domain/sport-rules/sportRule.types";

export const FUTEBOL_SOCIETY_RULE: PlatformSportRule = {
  sportName: "Futebol Society",
  naipeMode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  resultRule: ChampionshipSportResultRule.POINTS,
  defaultMatchDurationMinutes: 30,
  tieBreakerRule: ChampionshipSportTieBreakerRule.FUTEBOL_SOCIETY,
  supportsCards: true,
  tieBreakerPriority: [
    "Confronto direto",
    "Maior saldo de gols",
    "Mais gols marcados",
    "Menor número de cartões amarelos",
    "Menor número de cartões vermelhos",
    "Sorteio",
  ],
};
