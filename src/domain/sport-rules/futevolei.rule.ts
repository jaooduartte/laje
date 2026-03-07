import {
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
} from "@/lib/enums";
import type { PlatformSportRule } from "@/domain/sport-rules/sportRule.types";

export const FUTEVOLEI_RULE: PlatformSportRule = {
  sportName: "Futevôlei",
  naipeMode: ChampionshipSportNaipeMode.MASCULINO_FEMININO,
  pointsWin: 3,
  pointsDraw: 0,
  pointsLoss: 0,
  resultRule: ChampionshipSportResultRule.SETS,
  defaultMatchDurationMinutes: 40,
  tieBreakerRule: ChampionshipSportTieBreakerRule.POINTS_AVERAGE,
  supportsCards: false,
  tieBreakerPriority: ["Confronto direto", "Pontos average", "Sorteio"],
};
