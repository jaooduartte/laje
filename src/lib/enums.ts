export enum MatchStatus {
  SCHEDULED = "SCHEDULED",
  LIVE = "LIVE",
  FINISHED = "FINISHED",
}

export enum ThemeMode {
  AUTO = "auto",
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
  LINKS = "/links",
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
  LINKS = "is_links_page_blocked",
}

export enum TeamDivision {
  DIVISAO_PRINCIPAL = "DIVISAO_PRINCIPAL",
  DIVISAO_ACESSO = "DIVISAO_ACESSO",
}

export enum ChampionshipSeasonDivisionFormat {
  SEPARATED = "SEPARATED",
  UNIFIED = "UNIFIED",
}

export enum ChampionshipSeasonDivisionSettlementMode {
  NONE = "NONE",
  PROMOTION_RELEGATION = "PROMOTION_RELEGATION",
  TOP_N_TO_PRINCIPAL = "TOP_N_TO_PRINCIPAL",
}

export enum ChampionshipSchedulePeriod {
  MATUTINO = "MATUTINO",
  VESPERTINO = "VESPERTINO",
}

export enum ChampionshipIndividualEventKind {
  INDIVIDUAL = "INDIVIDUAL",
  RELAY = "RELAY",
}

export enum ChampionshipIndividualEventStatus {
  DRAFT = "DRAFT",
  SCHEDULED = "SCHEDULED",
  FINISHED = "FINISHED",
  CANCELLED = "CANCELLED",
}

export enum ChampionshipIndividualSessionStatus {
  DRAFT = "DRAFT",
  SCHEDULED = "SCHEDULED",
  LIVE = "LIVE",
  FINISHED = "FINISHED",
  CANCELLED = "CANCELLED",
}

export enum ChampionshipIndividualEntryStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  DNS = "DNS",
  DSQ = "DSQ",
  CANCELLED = "CANCELLED",
  DSQ_OVER_LIMIT = "DSQ_OVER_LIMIT",
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

export enum MatchManualRepresentationMode {
  AUTO = "AUTO",
  CO = "CO",
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
  FUTEBOL_SOCIETY = "FUTEBOL_SOCIETY",
  HANDEBOL = "HANDEBOL",
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

export enum ChampionshipBracketTieBreakContextType {
  GROUP = "GROUP",
  QUALIFICATION_POOL = "QUALIFICATION_POOL",
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

export enum LeagueEventReservationRequestStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export enum LeagueCalendarHolidayScope {
  NATIONAL = "NATIONAL",
  JOINVILLE = "JOINVILLE",
}

export enum LeagueCalendarHolidayDayKind {
  HOLIDAY = "HOLIDAY",
  OPTIONAL = "OPTIONAL",
}

export enum AdminPanelTab {
  BRACKET_SETUP = "bracket_setup",
  MATCHES = "matches",
  CONTROL = "control",
  INDIVIDUAL_EVENTS = "individual_events",
  TEAMS = "teams",
  SPORTS = "sports",
  EVENTS = "events",
  LINKS = "links",
  LOGS = "logs",
  USERS = "users",
  ACCOUNT = "account",
  STANDINGS = "standings",
  CHAMPIONSHIP_STATUS = "championship_status",
  SETTINGS = "settings",
  SCORE_SHEET_REVIEW = "score_sheet_review",
  TIE_BREAKS = "tie_breaks",
  CHAMPIONSHIP_SCHEDULE = "championship_schedule",
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

export enum AdminUserSortOption {
  NAME_ASC = "NAME_ASC",
  LAST_ACCESS_DESC = "LAST_ACCESS_DESC",
  ONLINE_DESC = "ONLINE_DESC",
  ACTIVE_STATUS_DESC = "ACTIVE_STATUS_DESC",
  PROFILE_ASC = "PROFILE_ASC",
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
  LEAGUE_EVENT_RESERVATION_REQUESTS = "public.league_event_reservation_requests",
  LEAGUE_EVENT_ORGANIZER_TEAMS = "public.league_event_organizer_teams",
  PUBLIC_LINK_SECTIONS = "public.public_link_sections",
  PUBLIC_LINK_ITEMS = "public.public_link_items",
  CHAMPIONSHIP_BRACKET_WORKFLOW = "public.championship_bracket_workflow",
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

export enum ChampionshipAwardType {
  TOP_SCORER = "TOP_SCORER",
  BEST_GOALKEEPER = "BEST_GOALKEEPER",
}

export enum PublicLinkFilterMode {
  GLOBAL = "GLOBAL",
  BY_CHAMPIONSHIP_YEAR = "BY_CHAMPIONSHIP_YEAR",
}
