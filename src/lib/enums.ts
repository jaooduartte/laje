export enum MatchStatus {
  SCHEDULED = "SCHEDULED",
  LIVE = "LIVE",
  FINISHED = "FINISHED",
}

export enum AppRoutePath {
  LIVE = "/",
  CHAMPIONSHIPS = "/championships",
  SCHEDULE = "/schedule",
  LEAGUE_CALENDAR = "/league-calendar",
  LOGIN = "/login",
  ADMIN = "/admin",
  LEGACY_CHAMPIONSHIPS = "/campeonatos",
  LEGACY_SCHEDULE = "/agenda",
}

export enum TeamDivision {
  DIVISAO_PRINCIPAL = "DIVISAO_PRINCIPAL",
  DIVISAO_ACESSO = "DIVISAO_ACESSO",
}

export enum MatchNaipe {
  MASCULINO = "MASCULINO",
  FEMININO = "FEMININO",
  MISTO = "MISTO",
}

export enum ChampionshipSportNaipeMode {
  MISTO = "MISTO",
  MASCULINO_FEMININO = "MASCULINO_FEMININO",
}

export enum ChampionshipSportTieBreakerRule {
  STANDARD = "STANDARD",
  POINTS_AVERAGE = "POINTS_AVERAGE",
  BEACH_SOCCER = "BEACH_SOCCER",
  BEACH_TENNIS = "BEACH_TENNIS",
}

export enum ChampionshipCode {
  CLV = "CLV",
  SOCIETY = "SOCIETY",
  INTERLAJE = "INTERLAJE",
}

export enum ChampionshipStatus {
  PLANNING = "PLANNING",
  UPCOMING = "UPCOMING",
  IN_PROGRESS = "IN_PROGRESS",
  FINISHED = "FINISHED",
}

export enum LeagueEventType {
  HH = "HH",
  OPEN_BAR = "OPEN_BAR",
  CHAMPIONSHIP = "CHAMPIONSHIP",
  LAJE_EVENT = "LAJE_EVENT",
}

export enum LeagueEventOrganizerType {
  ATHLETIC = "ATHLETIC",
  LAJE = "LAJE",
}

export enum AdminPanelTab {
  MATCHES = "matches",
  CONTROL = "control",
  TEAMS = "teams",
  SPORTS = "sports",
  EVENTS = "events",
}

export enum AdminPanelRole {
  ADMIN = "admin",
  MESA = "mesa",
}
