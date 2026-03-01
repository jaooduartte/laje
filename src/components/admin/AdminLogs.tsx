import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminActionType,
  AdminLogResourceTable,
  AdminPanelRole,
  ChampionshipStatus,
  LeagueEventOrganizerType,
  LeagueEventType,
  MatchNaipe,
  MatchStatus,
  TeamDivision,
} from "@/lib/enums";
import { CHAMPIONSHIP_STATUS_LABELS, MATCH_NAIPE_LABELS, TEAM_DIVISION_LABELS } from "@/lib/championship";
import { LEAGUE_EVENT_ORGANIZER_LABELS, LEAGUE_EVENT_TYPE_LABELS } from "@/domain/league-events/leagueEvent.constants";
import type { AdminActionLog } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL_USERS_FILTER = "ALL_USERS";
const ALL_ACTIONS_FILTER = "ALL_ACTIONS";
const MAXIMUM_LOG_CHANGES = 7;
const LOGS_GRID_TEMPLATE = "lg:grid-cols-[minmax(240px,max-content)_minmax(0,1fr)_120px]";
const LOGS_VISIBLE_PAGE_BUTTONS = 5;
const LOGS_ITEMS_PER_PAGE_OPTIONS = ["10", "20", "30", "50"];

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
};

const ADMIN_ACTION_TYPE_BADGE_CLASS_NAMES: Record<AdminActionType, string> = {
  [AdminActionType.INSERT]: "border border-emerald-300/70 bg-emerald-100 text-emerald-700",
  [AdminActionType.UPDATE]: "border border-amber-300/70 bg-amber-100 text-amber-700",
  [AdminActionType.DELETE]: "border border-rose-300/70 bg-rose-100 text-rose-700",
  [AdminActionType.PASSWORD_CHANGED]: "border border-blue-300/70 bg-blue-100 text-blue-700",
};

const ADMIN_LOG_RESOURCE_LABELS: Record<AdminLogResourceTable, string> = {
  [AdminLogResourceTable.CHAMPIONSHIPS]: "Campeonatos",
  [AdminLogResourceTable.SPORTS]: "Modalidades",
  [AdminLogResourceTable.TEAMS]: "Atléticas",
  [AdminLogResourceTable.MATCHES]: "Jogos",
  [AdminLogResourceTable.LEAGUE_EVENTS]: "Eventos da Liga",
  [AdminLogResourceTable.LEAGUE_EVENT_ORGANIZER_TEAMS]: "Organização de eventos",
  [AdminLogResourceTable.AUTH_USERS]: "Usuários administrativos",
};

const ADMIN_LOG_RESOURCE_ENTITY_LABELS: Record<AdminLogResourceTable, string> = {
  [AdminLogResourceTable.CHAMPIONSHIPS]: "campeonato",
  [AdminLogResourceTable.SPORTS]: "modalidade",
  [AdminLogResourceTable.TEAMS]: "atlética",
  [AdminLogResourceTable.MATCHES]: "jogo",
  [AdminLogResourceTable.LEAGUE_EVENTS]: "evento da liga",
  [AdminLogResourceTable.LEAGUE_EVENT_ORGANIZER_TEAMS]: "vínculo de organização do evento",
  [AdminLogResourceTable.AUTH_USERS]: "usuário administrativo",
};

const ADMIN_LOG_DEFAULT_FIELD_LABELS: Record<string, string> = {
  name: "Nome",
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
    value == AdminActionType.PASSWORD_CHANGED
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
    value == AdminLogResourceTable.AUTH_USERS
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

  return fieldName.replaceAll("_", " ");
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

  if (nextValues?.name && typeof nextValues.name == "string") {
    return nextValues.name;
  }

  if (previousValues?.name && typeof previousValues.name == "string") {
    return previousValues.name;
  }

  return null;
}

function resolveHeadline(log: AdminActionLog): string {
  if (log.action_type == AdminActionType.PASSWORD_CHANGED) {
    return "Senha de usuário administrativo alterada";
  }

  const resourceEntityLabel = resolveResourceEntityLabel(log.resource_table);
  const primaryName = resolvePrimaryName(log);
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
  if (log.action_type == AdminActionType.INSERT) {
    return `Novo item em ${resolveResourceLabel(log.resource_table)}.`;
  }

  if (log.action_type == AdminActionType.DELETE) {
    return `Item removido de ${resolveResourceLabel(log.resource_table)}.`;
  }

  if (log.action_type == AdminActionType.PASSWORD_CHANGED) {
    return "Alteração de senha registrada.";
  }

  return `Dados atualizados em ${resolveResourceLabel(log.resource_table)}.`;
}

function resolveOrSearchValue(searchText: string): string {
  const normalizedSearchText = searchText.trim().replaceAll(",", " ").replaceAll("%", "");

  if (!normalizedSearchText) {
    return "";
  }

  return [
    `resource_table.ilike.%${normalizedSearchText}%`,
    `description.ilike.%${normalizedSearchText}%`,
    `actor_email.ilike.%${normalizedSearchText}%`,
    `record_id.ilike.%${normalizedSearchText}%`,
  ].join(",");
}

function resolveVisiblePages(currentPage: number, totalPages: number): number[] {
  if (totalPages <= LOGS_VISIBLE_PAGE_BUTTONS) {
    return Array.from({ length: totalPages }, (_, pageIndex) => pageIndex + 1);
  }

  const halfRange = Math.floor(LOGS_VISIBLE_PAGE_BUTTONS / 2);
  let startPage = currentPage - halfRange;
  let endPage = currentPage + halfRange;

  if (startPage < 1) {
    endPage += 1 - startPage;
    startPage = 1;
  }

  if (endPage > totalPages) {
    startPage -= endPage - totalPages;
    endPage = totalPages;
  }

  return Array.from({ length: endPage - startPage + 1 }, (_, pageIndex) => startPage + pageIndex);
}

export function AdminLogs() {
  const [logs, setLogs] = useState<AdminActionLog[]>([]);
  const [teamNameById, setTeamNameById] = useState<TeamNameById>({});
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: string; email: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState(ALL_USERS_FILTER);
  const [selectedActionType, setSelectedActionType] = useState(ALL_ACTIONS_FILTER);
  const [resourceSearch, setResourceSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
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
        .filter((adminUser) => adminUser.user_id && adminUser.email)
        .map((adminUser) => ({
          id: adminUser.user_id,
          email: adminUser.email ?? "",
        }))
        .sort((firstUser, secondUser) => firstUser.email.localeCompare(secondUser.email));

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
        .select("id, actor_user_id, actor_email, actor_role, action_type, resource_table, record_id, description, old_data, new_data, metadata, created_at", { count: "exact" })
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
      userById.set(availableUser.id, availableUser.email);
    });

    logs.forEach((log) => {
      if (log.actor_user_id && log.actor_email) {
        userById.set(log.actor_user_id, log.actor_email);
      }
    });

    return [...userById.entries()]
      .map(([id, email]) => ({ id, email }))
      .sort((firstUser, secondUser) => firstUser.email.localeCompare(secondUser.email));
  }, [availableUsers, logs]);

  const listItems = useMemo(() => {
    return logs.map((log) => {
      const matchContextDetails = resolveMatchContextDetails(log, teamNameById);
      const detailChanges = resolveChangedFields(log, teamNameById);
      const detailList = [...matchContextDetails, ...detailChanges].slice(0, MAXIMUM_LOG_CHANGES);
      const resolvedDetails = detailList.length > 0 ? detailList : [resolveFallbackDetail(log)];
      const resourceLabel = resolveResourceLabel(log.resource_table);
      const headline = resolveHeadline(log);
      const actorEmail = log.actor_email ?? "Usuário desconhecido";
      return {
        id: log.id,
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
  const visiblePages = resolveVisiblePages(currentPage, totalPages);

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
                {userFilterOption.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedActionType} onValueChange={setSelectedActionType}>
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
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card enter-section flex flex-wrap items-center justify-end gap-2 p-3">
        <span className="text-xs text-muted-foreground">Itens por página</span>
        <Select
          value={String(itemsPerPage)}
          onValueChange={(value) => {
            const parsedValue = Number(value);

            if (Number.isNaN(parsedValue)) {
              return;
            }

            setItemsPerPage(parsedValue);
          }}
        >
          <SelectTrigger className="glass-input h-8 w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOGS_ITEMS_PER_PAGE_OPTIONS.map((itemsPerPageOption) => (
              <SelectItem key={itemsPerPageOption} value={itemsPerPageOption}>
                {itemsPerPageOption}
              </SelectItem>
            ))}
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
          <div className={`hidden ${LOGS_GRID_TEMPLATE} gap-3 border-b border-white/35 bg-white/25 px-4 py-2 text-xs font-semibold uppercase text-muted-foreground lg:grid`}>
            <p>Usuário e data</p>
            <p className="text-center">Ação registrada</p>
            <p className="text-right">Tipo</p>
          </div>

          <div className="divide-y divide-white/30">
            {listItems.map((logItem) => (
              <div key={logItem.id} className="px-4 py-3">
                <div className={`grid gap-2 ${LOGS_GRID_TEMPLATE} lg:items-start lg:gap-3`}>
                  <div className="space-y-1">
                    <p className="break-words text-sm font-medium leading-tight">{logItem.actorEmail}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(logItem.createdAt), "dd/MM/yyyy HH:mm")}</p>
                    {logItem.actorRole ? (
                      <p className="text-xs text-muted-foreground">{ADMIN_PANEL_ROLE_LABELS[logItem.actorRole]}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1 text-center">
                    <p className="text-sm font-medium">{logItem.headline}</p>

                    <ul className="space-y-0.5">
                      {logItem.details.map((logDetail, logDetailIndex) => (
                        <li key={`${logItem.id}-${logDetailIndex}`} className="text-xs text-muted-foreground">
                          {logDetail}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex justify-center lg:justify-end">
                    <Badge className={ADMIN_ACTION_TYPE_BADGE_CLASS_NAMES[logItem.actionType]}>
                      {ADMIN_ACTION_TYPE_LABELS[logItem.actionType]}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && totalCount > 0 ? (
        <div className="enter-section flex justify-center">
          <div className="flex items-center gap-1 rounded-2xl border border-white/45 bg-white/35 px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage == 1}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {visiblePages.map((visiblePage) => {
              const isCurrentPage = visiblePage == currentPage;

              return (
                <Button
                  key={visiblePage}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`h-8 min-w-8 rounded-xl px-2 text-xs ${
                    isCurrentPage ? "bg-primary/15 text-primary" : "text-muted-foreground"
                  }`}
                  onClick={() => setCurrentPage(visiblePage)}
                >
                  {visiblePage}
                </Button>
              );
            })}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage == totalPages}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
