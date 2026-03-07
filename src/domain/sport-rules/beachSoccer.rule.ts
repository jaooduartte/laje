import {
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
} from "@/lib/enums";
import type { PlatformSportRule } from "@/domain/sport-rules/sportRule.types";

export const BEACH_SOCCER_RULE: PlatformSportRule = {
  sportName: "Beach Soccer",
  naipeMode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  resultRule: ChampionshipSportResultRule.POINTS,
  defaultMatchDurationMinutes: 30,
  tieBreakerRule: ChampionshipSportTieBreakerRule.BEACH_SOCCER,
  supportsCards: true,
  tieBreakerPriority: [
    "Confronto direto",
    "Maior número de vitórias",
    "Maior saldo de gols",
    "Mais gols marcados",
    "Menos gols sofridos",
    "Menor número de cartões amarelos",
    "Menor número de cartões vermelhos",
    "Sorteio",
  ],
};
