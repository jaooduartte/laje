import {
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
} from "@/lib/enums";
import type { PlatformSportRule } from "@/domain/sport-rules/sportRule.types";

export const INTERLAJE_BASKETBALL_RULE: PlatformSportRule = {
  sportName: "Basquetebol",
  naipeMode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  resultRule: ChampionshipSportResultRule.POINTS,
  tieBreakerRule: ChampionshipSportTieBreakerRule.STANDARD,
  supportsCards: false,
  tieBreakerPriority: [
    "Confronto direto",
    "Maior saldo de pontos",
    "Maior pontuação pró",
    "Sorteio",
  ],
};

export const INTERLAJE_FUTSAL_RULE: PlatformSportRule = {
  sportName: "Futsal",
  naipeMode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  resultRule: ChampionshipSportResultRule.POINTS,
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

export const INTERLAJE_HANDBALL_RULE: PlatformSportRule = {
  sportName: "Handebol",
  naipeMode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  resultRule: ChampionshipSportResultRule.POINTS,
  tieBreakerRule: ChampionshipSportTieBreakerRule.HANDEBOL,
  supportsCards: true,
  tieBreakerPriority: [
    "Confronto direto",
    "Maior saldo de gols",
    "Mais gols marcados",
    "Menor número de cartões azuis",
    "Menor número de penalidades de 2 minutos",
    "Sorteio",
  ],
};

export const INTERLAJE_VOLLEYBALL_RULE: PlatformSportRule = {
  sportName: "Voleibol",
  naipeMode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
  pointsWin: 3,
  pointsDraw: 0,
  pointsLoss: 0,
  resultRule: ChampionshipSportResultRule.SETS,
  tieBreakerRule: ChampionshipSportTieBreakerRule.POINTS_AVERAGE,
  supportsCards: true,
  tieBreakerPriority: [
    "Maior número de vitórias",
    "Maior saldo de sets",
    "Maior saldo de pontos",
    "Confronto direto",
    "Sorteio",
  ],
};

export const INTERLAJE_SWIMMING_RULE: PlatformSportRule = {
  sportName: "Natação",
  naipeMode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
  pointsWin: 24,
  pointsDraw: 0,
  pointsLoss: 0,
  resultRule: ChampionshipSportResultRule.POINTS,
  tieBreakerRule: ChampionshipSportTieBreakerRule.STANDARD,
  supportsCards: false,
  tieBreakerPriority: [
    "Maior número de 1ºs lugares",
    "Maior número de 2ºs lugares",
    "Maior número de 3ºs lugares",
    "Maior número de 4ºs lugares",
    "Maior número de 5ºs lugares e assim sucessivamente até o 20º",
    "Sorteio",
  ],
};

export const INTERLAJE_ATHLETICS_RULE: PlatformSportRule = {
  sportName: "Atletismo",
  naipeMode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
  pointsWin: 24,
  pointsDraw: 0,
  pointsLoss: 0,
  resultRule: ChampionshipSportResultRule.POINTS,
  tieBreakerRule: ChampionshipSportTieBreakerRule.STANDARD,
  supportsCards: false,
  tieBreakerPriority: [
    "Maior número de 1ºs lugares",
    "Maior número de 2ºs lugares",
    "Maior número de 3ºs lugares",
    "Maior número de 4ºs lugares",
    "Maior número de 5ºs lugares e assim sucessivamente até o 20º",
    "Sorteio",
  ],
};
