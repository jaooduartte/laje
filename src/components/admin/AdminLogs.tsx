import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminActionType,
  AdminLogResourceTable,
  AppBadgeTone,
  AdminPanelRole,
  ChampionshipStatus,
  LeagueEventOrganizerType,
  LeagueEventType,
  MatchNaipe,
  MatchStatus,
  TeamDivision,
} from "@/lib/enums";
import { CHAMPIONSHIP_STATUS_LABELS, MATCH_NAIPE_LABELS, TEAM_DIVISION_LABELS } from "@/lib/championship";
import { isAdminUserPasswordStatus, resolveAdminUserPasswordStatusLabel } from "@/lib/adminUsers";
import { LEAGUE_EVENT_ORGANIZER_LABELS, LEAGUE_EVENT_TYPE_LABELS } from "@/domain/league-events/leagueEvent.constants";
import type { AdminActionLog } from "@/lib/types";
import { AppBadge } from "@/components/ui/app-badge";
import {
  AppPaginationControls,
  DEFAULT_PAGINATION_ITEMS_PER_PAGE,
} from "@/components/ui/app-pagination-controls";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL_USERS_FILTER = "ALL_USERS";
const ALL_ACTIONS_FILTER = "ALL_ACTIONS";
const MAXIMUM_LOG_CHANGES = 7;
const LOGS_GRID_TEMPLATE = "lg:grid-cols-[minmax(240px,max-content)_minmax(0,1fr)_120px]";

type ActionTypeFilterValue = AdminActionType | typeof ALL_ACTIONS_FILTER;

const ADMIN_PANEL_ROLE_LABELS: Record<AdminPanelRole, string> = {
  [AdminPanelRole.ADMIN]: "Admin",
  [AdminPanelRole.EVENTOS]: "Eventos",
  [AdminPanelRole.MESA]: "Mesa",
};

const ADMIN_ACTION_TYPE_LABELS: Record<AdminActionType, string> = {
  [AdminActionType.INSERT]: "Criação",
  [AdminActionType.UPDATE]: "Edição",
  [AdminActionType.DELETE]: "Exclusão",
  [AdminActionType.PASSWORD_CHANGED]: "Senha alterada",
  [AdminActionType.LOGIN]: "Login",
};

const ADMIN_ACTION_TYPE_BADGE_TONES: Record<AdminActionType, AppBadgeTone> = {
  [AdminActionType.INSERT]: AppBadgeTone.EMERALD,
  [AdminActionType.UPDATE]: AppBadgeTone.AMBER,
  [AdminActionType.DELETE]: AppBadgeTone.RED,
  [AdminActionType.PASSWORD_CHANGED]: AppBadgeTone.BLUE,
  [AdminActionType.LOGIN]: AppBadgeTone.SKY,
};

const ADMIN_LOG_RESOURCE_LABELS: Record<AdminLogResourceTable, string> = {
  [AdminLogResourceTable.CHAMPIONSHIPS]: "Campeonatos",
  [AdminLogResourceTable.SPORTS]: "Modalidades",
  [AdminLogResourceTable.TEAMS]: "Atléticas",
  [AdminLogResourceTable.MATCHES]: "Jogos",
  [AdminLogResourceTable.LEAGUE_EVENTS]: "Eventos da Liga",
  [AdminLogResourceTable.LEAGUE_EVENT_ORGANIZER_TEAMS]: "Organização de eventos",
  [AdminLogResourceTable.AUTH_USERS]: "Usuários administrativos",
  [AdminLogResourceTable.PUBLIC_PAGE_ACCESS_SETTINGS]: "Configurações públicas",
};

const ADMIN_LOG_RESOURCE_ENTITY_LABELS: Record<AdminLogResourceTable, string> = {
  [AdminLogResourceTable.CHAMPIONSHIPS]: "campeonato",
  [AdminLogResourceTable.SPORTS]: "modalidade",
  [AdminLogResourceTable.TEAMS]: "atlética",
  [AdminLogResourceTable.MATCHES]: "jogo",
  [AdminLogResourceTable.LEAGUE_EVENTS]: "evento da liga",
  [AdminLogResourceTable.LEAGUE_EVENT_ORGANIZER_TEAMS]: "vínculo de organização do evento",
  [AdminLogResourceTable.AUTH_USERS]: "usuário administrativo",
  [AdminLogResourceTable.PUBLIC_PAGE_ACCESS_SETTINGS]: "configuração pública",
};

const ADMIN_LOG_DEFAULT_FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  email: "E-mail",
  role: "Perfil",
  system_role: "Perfil de sistema",
  profile_id: "Perfil",
  profile_name: "Nome do perfil",
  login_identifier: "Login",
  password_status: "Status da senha",
  permissions: "Permissões",
  target_user_name: "Usuário",
  target_user_email: "E-mail do usuário",
  target_user_login_identifier: "Login do usuário",
  target_user_role: "Perfil do usuário",
  target_user_id: "ID do usuário",
  city: "Cidade",
  status: "Status",
  location: "Local",
  start_time: "Início",
  end_time: "Término",
  event_date: "Data do evento",
  event_type: "Tipo do evento",
  organizer_type: "Tipo de organização",
  division: "Divisão",
  naipe: "Naipe",
  home_score: "Placar da casa",
  away_score: "Placar visitante",
  home_yellow_cards: "Cartões amarelos da casa",
  home_red_cards: "Cartões vermelhos da casa",
  away_yellow_cards: "Cartões amarelos do visitante",
  away_red_cards: "Cartões vermelhos do visitante",
  supports_cards: "Permite cartões",
  default_location: "Local padrão",
  uses_divisions: "Usa divisões",
  points_win: "Pontos por vitória",
  points_draw: "Pontos por empate",
  points_loss: "Pontos por derrota",
};

const ADMIN_LOG_RESOURCE_FIELD_LABELS: Partial<Record<AdminLogResourceTable, Record<string, string>>> = {
  [AdminLogResourceTable.MATCHES]: {
    home_team_id: "Atlética da casa",
    away_team_id: "Atlética visitante",
    sport_id: "Modalidade",
    championship_id: "Campeonato",
  },
  [AdminLogResourceTable.LEAGUE_EVENTS]: {
    organizer_team_id: "Atlética organizadora principal",
  },
  [AdminLogResourceTable.LEAGUE_EVENT_ORGANIZER_TEAMS]: {
    event_id: "Evento",
    team_id: "Atlética organizadora",
  },
  [AdminLogResourceTable.PUBLIC_PAGE_ACCESS_SETTINGS]: {
    is_public_access_blocked: "Bloqueio público",
    is_live_page_blocked: "Bloqueio da tela Ao Vivo",
    is_championships_page_blocked: "Bloqueio da tela Campeonatos",
    is_schedule_page_blocked: "Bloqueio da tela Agenda",
    is_league_calendar_page_blocked: "Bloqueio da tela Calendário da Liga",
    blocked_message: "Mensagem de manutenção",
  },
  [AdminLogResourceTable.CHAMPIONSHIPS]: {
    code: "Código do campeonato",
  },
};

const ADMIN_LOG_IGNORED_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "encrypted_password",
  "raw_app_meta_data",
  "raw_user_meta_data",
  "confirmation_token",
  "email_change",
  "email_change_token_new",
  "recovery_token",
  "instance_id",
  "aud",
  "role",
  "last_sign_in_at",
  "email_confirmed_at",
  "phone_confirmed_at",
  "confirmation_sent_at",
  "email_change_sent_at",
  "reauthentication_token",
  "reauthentication_sent_at",
  "is_sso_user",
  "deleted_at",
  "is_anonymous",
]);

const MATCH_SCORE_FIELDS = new Set(["home_score", "away_score"]);
const MATCH_TEAM_FIELDS = new Set(["home_team_id", "away_team_id"]);

interface AdminLogListItem {
  id: string;
  rawLog: AdminActionLog;
  actorName: string;
  actorEmail: string;
  actorRole: AdminPanelRole | null;
  actionType: AdminActionType;
  createdAt: string;
  headline: string;
  details: string[];
}

type TeamNameById = Record<string, string>;

function isAdminActionType(value: string): value is AdminActionType {
  return (
    value == AdminActionType.INSERT ||
    value == AdminActionType.UPDATE ||
    value == AdminActionType.DELETE ||
    value == AdminActionType.PASSWORD_CHANGED ||
    value == AdminActionType.LOGIN
  );
}

function isAdminPanelRole(value: string): value is AdminPanelRole {
  return value == AdminPanelRole.ADMIN || value == AdminPanelRole.EVENTOS || value == AdminPanelRole.MESA;
}

function isAdminLogResourceTable(value: string): value is AdminLogResourceTable {
  return (
    value == AdminLogResourceTable.CHAMPIONSHIPS ||
    value == AdminLogResourceTable.SPORTS ||
    value == AdminLogResourceTable.TEAMS ||
    value == AdminLogResourceTable.MATCHES ||
    value == AdminLogResourceTable.LEAGUE_EVENTS ||
    value == AdminLogResourceTable.LEAGUE_EVENT_ORGANIZER_TEAMS ||
    value == AdminLogResourceTable.AUTH_USERS ||
    value == AdminLogResourceTable.PUBLIC_PAGE_ACCESS_SETTINGS
  );
}

function isMatchStatusValue(value: string): value is MatchStatus {
  return value == MatchStatus.SCHEDULED || value == MatchStatus.LIVE || value == MatchStatus.FINISHED;
}

function isMatchNaipeValue(value: string): value is MatchNaipe {
  return value == MatchNaipe.MASCULINO || value == MatchNaipe.FEMININO || value == MatchNaipe.MISTO;
}

function isTeamDivisionValue(value: string): value is TeamDivision {
  return value == TeamDivision.DIVISAO_PRINCIPAL || value == TeamDivision.DIVISAO_ACESSO;
}

function isChampionshipStatusValue(value: string): value is ChampionshipStatus {
  return (
    value == ChampionshipStatus.PLANNING ||
    value == ChampionshipStatus.UPCOMING ||
    value == ChampionshipStatus.IN_PROGRESS ||
    value == ChampionshipStatus.FINISHED
  );
}

function isLeagueEventOrganizerTypeValue(value: string): value is LeagueEventOrganizerType {
  return value == LeagueEventOrganizerType.ATHLETIC || value == LeagueEventOrganizerType.LAJE;
}

function isLeagueEventTypeValue(value: string): value is LeagueEventType {
  return (
    value == LeagueEventType.HH ||
    value == LeagueEventType.OPEN_BAR ||
    value == LeagueEventType.CHAMPIONSHIP ||
    value == LeagueEventType.LAJE_EVENT
  );
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value == "object" && value != null && !Array.isArray(value);
}

function resolveRecordValue(value: unknown): Record<string, unknown> | null {
  return isRecordValue(value) ? value : null;
}

function resolveResourceLabel(resourceTable: string): string {
  if (isAdminLogResourceTable(resourceTable)) {
    return ADMIN_LOG_RESOURCE_LABELS[resourceTable];
  }

  return "Registro";
}

function resolveResourceEntityLabel(resourceTable: string): string {
  if (isAdminLogResourceTable(resourceTable)) {
    return ADMIN_LOG_RESOURCE_ENTITY_LABELS[resourceTable];
  }

  return "registro";
}

function resolveFieldLabel(resourceTable: string, fieldName: string): string {
  if (isAdminLogResourceTable(resourceTable)) {
    const resourceFieldLabels = ADMIN_LOG_RESOURCE_FIELD_LABELS[resourceTable];

    if (resourceFieldLabels && resourceFieldLabels[fieldName]) {
      return resourceFieldLabels[fieldName];
    }
  }

  if (ADMIN_LOG_DEFAULT_FIELD_LABELS[fieldName]) {
    return ADMIN_LOG_DEFAULT_FIELD_LABELS[fieldName];
  }

  return fieldName.replace(/_/g, " ");
}

function resolveDateText(value: string): string {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  if (value.includes("T")) {
    return format(parsedDate, "dd/MM/yyyy HH:mm");
  }

  return format(parsedDate, "dd/MM/yyyy");
}

function resolveTeamName(teamNameById: TeamNameById, teamId: unknown): string {
  if (typeof teamId != "string" || teamId.length == 0) {
    return "Atlética não informada";
  }

  return teamNameById[teamId] ?? "Atlética cadastrada";
}

function resolveFieldValueText(fieldName: string, value: unknown, teamNameById: TeamNameById): string {
  if (value == null) {
    return "não informado";
  }

  if (typeof value == "boolean") {
    return value ? "Sim" : "Não";
  }

  if (typeof value == "number") {
    return String(value);
  }

  if (typeof value == "string") {
    if (fieldName == "home_team_id" || fieldName == "away_team_id" || fieldName == "team_id" || fieldName == "organizer_team_id") {
      return resolveTeamName(teamNameById, value);
    }

    if (fieldName.endsWith("_id")) {
      return "item vinculado";
    }

    if (fieldName == "event_date" || fieldName == "start_time" || fieldName == "end_time") {
      return resolveDateText(value);
    }

    if (fieldName == "event_type" && isLeagueEventTypeValue(value)) {
      return LEAGUE_EVENT_TYPE_LABELS[value];
    }

    if (fieldName == "organizer_type" && isLeagueEventOrganizerTypeValue(value)) {
      return LEAGUE_EVENT_ORGANIZER_LABELS[value];
    }

    if (fieldName == "naipe" && isMatchNaipeValue(value)) {
      return MATCH_NAIPE_LABELS[value];
    }

    if (fieldName == "division" && isTeamDivisionValue(value)) {
      return TEAM_DIVISION_LABELS[value];
    }

    if (fieldName == "status" && isMatchStatusValue(value)) {
      if (value == MatchStatus.SCHEDULED) {
        return "Agendado";
      }

      if (value == MatchStatus.LIVE) {
        return "Ao vivo";
      }

      return "Encerrado";
    }

    if (fieldName == "status" && isChampionshipStatusValue(value)) {
      return CHAMPIONSHIP_STATUS_LABELS[value];
    }

    if (fieldName == "password_status" && isAdminUserPasswordStatus(value)) {
      return resolveAdminUserPasswordStatusLabel(value);
    }

    return value;
  }

  if (Array.isArray(value)) {
    return "lista atualizada";
  }

  return "atualizado";
}

function resolveComparableValue(value: unknown): string {
  if (value == null) {
    return "null";
  }

  if (typeof value == "string" || typeof value == "number" || typeof value == "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function resolveMatchContextDetails(log: AdminActionLog, teamNameById: TeamNameById): string[] {
  if (log.resource_table != AdminLogResourceTable.MATCHES) {
    return [];
  }

  const previousValues = resolveRecordValue(log.old_data) ?? {};
  const nextValues = resolveRecordValue(log.new_data) ?? {};

  const homeTeamId = nextValues.home_team_id ?? previousValues.home_team_id;
  const awayTeamId = nextValues.away_team_id ?? previousValues.away_team_id;
  const homeTeamName = resolveTeamName(teamNameById, homeTeamId);
  const awayTeamName = resolveTeamName(teamNameById, awayTeamId);

  const details: string[] = [];

  details.push(`Atléticas: ${homeTeamName} x ${awayTeamName}`);

  const previousHomeScore =
    typeof previousValues.home_score == "number" ? previousValues.home_score : null;
  const previousAwayScore =
    typeof previousValues.away_score == "number" ? previousValues.away_score : null;
  const nextHomeScore =
    typeof nextValues.home_score == "number" ? nextValues.home_score : null;
  const nextAwayScore =
    typeof nextValues.away_score == "number" ? nextValues.away_score : null;

  if (
    log.action_type == AdminActionType.UPDATE &&
    nextHomeScore != null &&
    nextAwayScore != null &&
    previousHomeScore != null &&
    previousAwayScore != null &&
    (previousHomeScore != nextHomeScore || previousAwayScore != nextAwayScore)
  ) {
    details.push(
      `Placar: ${homeTeamName} ${nextHomeScore} x ${nextAwayScore} ${awayTeamName} (antes: ${previousHomeScore} x ${previousAwayScore})`,
    );
    return details;
  }

  if (log.action_type == AdminActionType.INSERT && nextHomeScore != null && nextAwayScore != null) {
    details.push(`Placar inicial: ${homeTeamName} ${nextHomeScore} x ${nextAwayScore} ${awayTeamName}`);
    return details;
  }

  if (log.action_type == AdminActionType.DELETE && previousHomeScore != null && previousAwayScore != null) {
    details.push(`Placar final removido: ${homeTeamName} ${previousHomeScore} x ${previousAwayScore} ${awayTeamName}`);
    return details;
  }

  return details;
}

function resolveChangedFields(log: AdminActionLog, teamNameById: TeamNameById): string[] {
  if (log.action_type != AdminActionType.UPDATE) {
    return [];
  }

  const previousValues = resolveRecordValue(log.old_data) ?? {};
  const nextValues = resolveRecordValue(log.new_data) ?? {};
  const fieldNames = [...new Set([...Object.keys(previousValues), ...Object.keys(nextValues)])];

  return fieldNames
    .filter((fieldName) => !ADMIN_LOG_IGNORED_FIELDS.has(fieldName))
    .filter((fieldName) => !(log.resource_table == AdminLogResourceTable.MATCHES && MATCH_SCORE_FIELDS.has(fieldName)))
    .filter((fieldName) => resolveComparableValue(previousValues[fieldName]) != resolveComparableValue(nextValues[fieldName]))
    .map((fieldName) => {
      const fieldLabel = resolveFieldLabel(log.resource_table, fieldName);

      const previousValueText = resolveFieldValueText(fieldName, previousValues[fieldName], teamNameById);
      const nextValueText = resolveFieldValueText(fieldName, nextValues[fieldName], teamNameById);

      if (log.resource_table == AdminLogResourceTable.MATCHES && MATCH_TEAM_FIELDS.has(fieldName)) {
        return `${fieldLabel}: ${previousValueText} para ${nextValueText}`;
      }

      return `${fieldLabel}: ${previousValueText} para ${nextValueText}`;
    })
    .slice(0, MAXIMUM_LOG_CHANGES);
}

function resolvePrimaryName(log: AdminActionLog): string | null {
  const nextValues = resolveRecordValue(log.new_data);
  const previousValues = resolveRecordValue(log.old_data);
  const metadata = resolveRecordValue(log.metadata);

  if (nextValues?.name && typeof nextValues.name == "string") {
    return nextValues.name;
  }

  if (previousValues?.name && typeof previousValues.name == "string") {
    return previousValues.name;
  }

  if (metadata?.target_user_name && typeof metadata.target_user_name == "string") {
    return metadata.target_user_name;
  }

  return null;
}

function resolveHeadline(log: AdminActionLog): string {
  const primaryName = resolvePrimaryName(log);

  if (log.action_type == AdminActionType.LOGIN) {
    return primaryName ? `Acessou a plataforma: ${primaryName}` : "Acessou a plataforma";
  }

  if (log.action_type == AdminActionType.PASSWORD_CHANGED) {
    return primaryName
      ? `Senha de usuário administrativo alterada: ${primaryName}`
      : "Senha de usuário administrativo alterada";
  }

  const resourceEntityLabel = resolveResourceEntityLabel(log.resource_table);
  const suffix = primaryName ? `: ${primaryName}` : "";

  if (log.action_type == AdminActionType.INSERT) {
    return `Criou ${resourceEntityLabel}${suffix}`;
  }

  if (log.action_type == AdminActionType.DELETE) {
    return `Removeu ${resourceEntityLabel}${suffix}`;
  }

  return `Atualizou ${resourceEntityLabel}${suffix}`;
}

function resolveFallbackDetail(log: AdminActionLog): string {
  const primaryName = resolvePrimaryName(log);

  if (log.action_type == AdminActionType.LOGIN) {
    return "Login administrativo registrado.";
  }

  if (log.resource_table == AdminLogResourceTable.AUTH_USERS && log.action_type == AdminActionType.INSERT) {
    return primaryName
      ? `Usuário administrativo ${primaryName} criado com sucesso.`
      : "Novo usuário administrativo criado.";
  }

  if (log.resource_table == AdminLogResourceTable.AUTH_USERS && log.action_type == AdminActionType.DELETE) {
    return primaryName
      ? `Usuário administrativo ${primaryName} removido.`
      : "Usuário administrativo removido.";
  }

  if (log.action_type == AdminActionType.INSERT) {
    return `Novo item em ${resolveResourceLabel(log.resource_table)}.`;
  }

  if (log.action_type == AdminActionType.DELETE) {
    return `Item removido de ${resolveResourceLabel(log.resource_table)}.`;
  }

  if (log.action_type == AdminActionType.PASSWORD_CHANGED) {
    return primaryName ? `Alteração de senha registrada para ${primaryName}.` : "Alteração de senha registrada.";
  }

  return primaryName
    ? `Dados de ${primaryName} atualizados em ${resolveResourceLabel(log.resource_table)}.`
    : `Dados atualizados em ${resolveResourceLabel(log.resource_table)}.`;
}

function resolveOrSearchValue(searchText: string): string {
  const normalizedSearchText = searchText.trim().replace(/,/g, " ").replace(/%/g, "");

  if (!normalizedSearchText) {
    return "";
  }

  return [
    `resource_table.ilike.%${normalizedSearchText}%`,
    `description.ilike.%${normalizedSearchText}%`,
    `actor_name.ilike.%${normalizedSearchText}%`,
    `actor_email.ilike.%${normalizedSearchText}%`,
    `record_id.ilike.%${normalizedSearchText}%`,
  ].join(",");
}

export function AdminLogs() {
  const [logs, setLogs] = useState<AdminActionLog[]>([]);
  const [teamNameById, setTeamNameById] = useState<TeamNameById>({});
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLogForJson, setSelectedLogForJson] = useState<AdminActionLog | null>(null);
  const [selectedUserId, setSelectedUserId] = useState(ALL_USERS_FILTER);
  const [selectedActionType, setSelectedActionType] = useState<ActionTypeFilterValue>(ALL_ACTIONS_FILTER);
  const [resourceSearch, setResourceSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGINATION_ITEMS_PER_PAGE);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const fetchTeamsAndUsers = async () => {
      const [{ data: teamsData }, { data: adminUsersData }] = await Promise.all([
        supabase.from("teams").select("id, name"),
        supabase.rpc("list_admin_users"),
      ]);

      const nextTeamNameById = (teamsData ?? []).reduce<TeamNameById>((teamMap, team) => {
        if (!team.id || !team.name) {
          return teamMap;
        }

        teamMap[team.id] = team.name;
        return teamMap;
      }, {});

      setTeamNameById(nextTeamNameById);

      const nextAvailableUsers = (adminUsersData ?? [])
        .filter((adminUser) => adminUser.user_id && adminUser.name)
        .map((adminUser) => ({
          id: adminUser.user_id,
          label: adminUser.name,
        }))
        .sort((firstUser, secondUser) => firstUser.label.localeCompare(secondUser.label));

      setAvailableUsers(nextAvailableUsers);
    };

    fetchTeamsAndUsers();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage, resourceSearch, selectedActionType, selectedUserId]);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);

      const rangeStart = (currentPage - 1) * itemsPerPage;
      const rangeEnd = rangeStart + itemsPerPage - 1;

      let logsQuery = supabase
        .from("admin_action_logs")
        .select("id, actor_user_id, actor_name, actor_email, actor_role, action_type, resource_table, record_id, description, old_data, new_data, metadata, created_at", { count: "exact" })
        .neq("resource_table", AdminLogResourceTable.LEAGUE_EVENT_ORGANIZER_TEAMS)
        .order("created_at", { ascending: false });

      if (selectedUserId != ALL_USERS_FILTER) {
        logsQuery = logsQuery.eq("actor_user_id", selectedUserId);
      }

      if (selectedActionType != ALL_ACTIONS_FILTER) {
        logsQuery = logsQuery.eq("action_type", selectedActionType);
      }

      const orSearchValue = resolveOrSearchValue(resourceSearch);

      if (orSearchValue) {
        logsQuery = logsQuery.or(orSearchValue);
      }

      const { data, error, count } = await logsQuery.range(rangeStart, rangeEnd);

      if (error) {
        toast.error(error.message);
        setLogs([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }

      const normalizedLogs = (data ?? []).map((log) => ({
        ...log,
        actor_role:
          log.actor_role && isAdminPanelRole(log.actor_role)
            ? log.actor_role
            : null,
        action_type: isAdminActionType(log.action_type) ? log.action_type : AdminActionType.UPDATE,
        old_data: resolveRecordValue(log.old_data),
        new_data: resolveRecordValue(log.new_data),
      })) as AdminActionLog[];

      setLogs(normalizedLogs);
      setTotalCount(count ?? 0);
      setLoading(false);
    };

    fetchLogs();
  }, [currentPage, itemsPerPage, resourceSearch, selectedActionType, selectedUserId]);

  const userFilterOptions = useMemo(() => {
    const userById = new Map<string, string>();

    availableUsers.forEach((availableUser) => {
      userById.set(availableUser.id, availableUser.label);
    });

    logs.forEach((log) => {
      if (log.actor_user_id) {
        userById.set(log.actor_user_id, log.actor_name ?? log.actor_email ?? "Usuário desconhecido");
      }
    });

    return [...userById.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((firstUser, secondUser) => firstUser.label.localeCompare(secondUser.label));
  }, [availableUsers, logs]);

  const listItems = useMemo(() => {
    return logs.map((log) => {
      const matchContextDetails = resolveMatchContextDetails(log, teamNameById);
      const detailChanges = resolveChangedFields(log, teamNameById);
      const detailList = [...matchContextDetails, ...detailChanges].slice(0, MAXIMUM_LOG_CHANGES);
      const resolvedDetails = detailList.length > 0 ? detailList : [resolveFallbackDetail(log)];
      const headline = resolveHeadline(log);
      const actorName = log.actor_name ?? log.actor_email ?? "Usuário desconhecido";
      const actorEmail = log.actor_email ?? "Usuário desconhecido";
      return {
        id: log.id,
        rawLog: log,
        actorName,
        actorEmail,
        actorRole: log.actor_role,
        actionType: log.action_type,
        createdAt: log.created_at,
        headline,
        details: resolvedDetails,
      } satisfies AdminLogListItem;
    });
  }, [logs, teamNameById]);

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));

  const handleSelectedActionTypeChange = (value: string) => {
    if (value == ALL_ACTIONS_FILTER || isAdminActionType(value)) {
      setSelectedActionType(value);
    }
  };

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="space-y-4">
      <div className="glass-card enter-section grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_220px_220px]">
        <Input
          value={resourceSearch}
          onChange={(event) => setResourceSearch(event.target.value)}
          placeholder="Filtrar por recurso, descrição ou usuário"
          className="glass-input"
        />

        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger className="glass-input">
            <SelectValue placeholder="Filtrar usuário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_USERS_FILTER}>Todos os usuários</SelectItem>
            {userFilterOptions.map((userFilterOption) => (
              <SelectItem key={userFilterOption.id} value={userFilterOption.id}>
                {userFilterOption.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedActionType} onValueChange={handleSelectedActionTypeChange}>
          <SelectTrigger className="glass-input">
            <SelectValue placeholder="Filtrar ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ACTIONS_FILTER}>Todas as ações</SelectItem>
            <SelectItem value={AdminActionType.INSERT}>{ADMIN_ACTION_TYPE_LABELS[AdminActionType.INSERT]}</SelectItem>
            <SelectItem value={AdminActionType.UPDATE}>{ADMIN_ACTION_TYPE_LABELS[AdminActionType.UPDATE]}</SelectItem>
            <SelectItem value={AdminActionType.DELETE}>{ADMIN_ACTION_TYPE_LABELS[AdminActionType.DELETE]}</SelectItem>
            <SelectItem value={AdminActionType.PASSWORD_CHANGED}>
              {ADMIN_ACTION_TYPE_LABELS[AdminActionType.PASSWORD_CHANGED]}
            </SelectItem>
            <SelectItem value={AdminActionType.LOGIN}>{ADMIN_ACTION_TYPE_LABELS[AdminActionType.LOGIN]}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="glass-card enter-section flex min-h-28 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : listItems.length == 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum log encontrado para os filtros aplicados.</p>
      ) : (
        <div className="glass-card enter-section overflow-hidden">
          <div className={`hidden ${LOGS_GRID_TEMPLATE} gap-3 border-b border-border/45 bg-secondary/35 px-4 py-2 text-xs font-semibold uppercase text-muted-foreground lg:grid`}>
            <p>Usuário e data</p>
            <p className="text-center">Ação registrada</p>
            <p className="text-right">Tipo</p>
          </div>

          <div className="divide-y divide-border/45">
            {listItems.map((logItem) => (
              <div key={logItem.id} className="px-4 py-3">
                <div className={`grid gap-2 ${LOGS_GRID_TEMPLATE} lg:items-start lg:gap-3`}>
                  <div className="space-y-1">
                    <p className="break-words text-sm font-medium leading-tight">{logItem.actorName}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(logItem.createdAt), "dd/MM/yyyy HH:mm")}</p>
                    {logItem.actorEmail != logItem.actorName ? (
                      <p className="break-words text-xs text-muted-foreground">{logItem.actorEmail}</p>
                    ) : null}
                    {logItem.actorRole ? (
                      <p className="text-xs text-muted-foreground">{ADMIN_PANEL_ROLE_LABELS[logItem.actorRole]}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1 text-center">
                    <button
                      type="button"
                      onClick={() => setSelectedLogForJson(logItem.rawLog)}
                      className="text-sm font-medium text-primary underline-offset-2 transition-colors hover:underline"
                    >
                      {logItem.headline}
                    </button>

                    <ul className="space-y-0.5">
                      {logItem.details.map((logDetail, logDetailIndex) => (
                        <li key={`${logItem.id}-${logDetailIndex}`} className="text-xs text-muted-foreground">
                          {logDetail}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex justify-center lg:justify-end">
                    <AppBadge tone={ADMIN_ACTION_TYPE_BADGE_TONES[logItem.actionType]}>
                      {ADMIN_ACTION_TYPE_LABELS[logItem.actionType]}
                    </AppBadge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && totalCount > 0 ? (
        <div className="space-y-2">
          <p className="text-center text-xs text-muted-foreground">Total de itens: {totalCount}</p>
          <AppPaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            showBoundaryButtons
            itemsPerPage={itemsPerPage}
            onItemsPerPageChange={setItemsPerPage}
          />
        </div>
      ) : null}

      <Dialog
        open={selectedLogForJson != null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setSelectedLogForJson(null);
          }
        }}
      >
        <DialogContent className="border-border/60 !bg-background/70 backdrop-blur-md shadow-[0_18px_45px_rgba(15,23,42,0.16)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes técnicos do log</DialogTitle>
            <DialogDescription>
              Registro JSON completo da ação selecionada.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-auto rounded-xl border border-border/50 bg-background/35 p-3">
            <pre className="text-xs leading-relaxed text-foreground">
              {JSON.stringify(selectedLogForJson, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
