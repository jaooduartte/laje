export enum MatchStatus {
  SCHEDULED = "SCHEDULED",
  LIVE = "LIVE",
  FINISHED = "FINISHED",
}

export enum ThemeMode {
  LIGHT = "light",
  DARK = "dark",
}

export enum ThemeTimeZone {
  SAO_PAULO = "America/Sao_Paulo",
}

export enum AppBadgeTone {
  NEUTRAL = "NEUTRAL",
  PRIMARY = "PRIMARY",
  RED = "RED",
  AMBER = "AMBER",
  EMERALD = "EMERALD",
  SKY = "SKY",
  BLUE = "BLUE",
  GOLD = "GOLD",
  SILVER = "SILVER",
  BRONZE = "BRONZE",
}

export enum AppRoutePath {
  HOME = "/",
  LIVE = "/ao-vivo",
  CHAMPIONSHIPS = "/campeonatos",
  SCHEDULE = "/agenda",
  LEAGUE_CALENDAR = "/calendario-da-liga",
  LOGIN = "/login",
  ADMIN = "/admin",
  LEGACY_CHAMPIONSHIPS = "/championships",
  LEGACY_SCHEDULE = "/schedule",
  LEGACY_LEAGUE_CALENDAR = "/league-calendar",
}

export enum PublicPageAccessSettingField {
  LIVE = "is_live_page_blocked",
  CHAMPIONSHIPS = "is_championships_page_blocked",
  SCHEDULE = "is_schedule_page_blocked",
  LEAGUE_CALENDAR = "is_league_calendar_page_blocked",
}

export enum TeamDivision {
  DIVISAO_PRINCIPAL = "DIVISAO_PRINCIPAL",
  DIVISAO_ACESSO = "DIVISAO_ACESSO",
}

export enum TeamDivisionSelection {
  DIVISAO_PRINCIPAL = "DIVISAO_PRINCIPAL",
  DIVISAO_ACESSO = "DIVISAO_ACESSO",
  WITHOUT_DIVISION = "WITHOUT_DIVISION",
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

export enum ChampionshipSportResultRule {
  POINTS = "POINTS",
  SETS = "SETS",
}

export enum BracketPhase {
  GROUP_STAGE = "GROUP_STAGE",
  KNOCKOUT = "KNOCKOUT",
}

export enum BracketEditionStatus {
  DRAFT = "DRAFT",
  GROUPS_GENERATED = "GROUPS_GENERATED",
  KNOCKOUT_GENERATED = "KNOCKOUT_GENERATED",
}

export enum BracketThirdPlaceMode {
  NONE = "NONE",
  MATCH = "MATCH",
  CHAMPION_SEMIFINAL_LOSER = "CHAMPION_SEMIFINAL_LOSER",
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
  LOGS = "logs",
  USERS = "users",
  ACCOUNT = "account",
  SETTINGS = "settings",
}

export enum AdminPanelRole {
  ADMIN = "admin",
  EVENTOS = "eventos",
  MESA = "mesa",
}

export enum AdminUserPasswordStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
}

export enum AdminLoginStage {
  LOGIN_IDENTIFIER = "LOGIN_IDENTIFIER",
  PASSWORD = "PASSWORD",
  PASSWORD_SETUP = "PASSWORD_SETUP",
}

export enum AdminPanelPermissionLevel {
  NONE = "NONE",
  VIEW = "VIEW",
  EDIT = "EDIT",
}

export enum AdminActionType {
  INSERT = "INSERT",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  PASSWORD_CHANGED = "PASSWORD_CHANGED",
  LOGIN = "LOGIN",
}

export enum AdminLogResourceTable {
  CHAMPIONSHIPS = "public.championships",
  SPORTS = "public.sports",
  TEAMS = "public.teams",
  MATCHES = "public.matches",
  LEAGUE_EVENTS = "public.league_events",
  LEAGUE_EVENT_ORGANIZER_TEAMS = "public.league_event_organizer_teams",
  AUTH_USERS = "auth.users",
  PUBLIC_PAGE_ACCESS_SETTINGS = "public.public_page_access_settings",
}

export enum OnlineVisitorsContext {
  SITE_TOTAL = "SITE_TOTAL",
  LIVE_PAGE = "LIVE_PAGE",
}

export enum RealtimePresenceChannel {
  SITE_TOTAL = "presence:site-visitors",
  LIVE_PAGE = "presence:live-page-visitors",
}
