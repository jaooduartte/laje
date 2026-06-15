import {
  ChampionshipSportNaipeMode,
  ChampionshipSportResultRule,
  ChampionshipSportTieBreakerRule,
} from "@/lib/enums";

export interface PlatformSportRule {
  sportName: string;
  naipeMode: ChampionshipSportNaipeMode;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  resultRule: ChampionshipSportResultRule;
  tieBreakerRule: ChampionshipSportTieBreakerRule;
  supportsCards: boolean;
  tieBreakerPriority: string[];
}
