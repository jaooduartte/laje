import { useMemo, useState } from "react";
import { Loader2, MoreVertical, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Team } from "@/lib/types";
import { AppBadgeTone, TeamDivision, TeamDivisionSelection } from "@/lib/enums";
import { Button } from "@/components/ui/button";
import { AppBadge } from "@/components/ui/app-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TEAM_DIVISION_BADGE_TONES,
  TEAM_DIVISION_LABELS,
  TEAM_DIVISION_SELECTION_LABELS,
  isTeamDivisionSelection,
} from "@/lib/championship";

interface Props {
  teams: Team[];
  onRefetch: () => void;
  canManageTeams?: boolean;
}

const TEAM_CITY_OPTIONS = ["Joinville", "Blumenau", "Jaraguá do Sul"] as const;
const ALL_TEAMS_DIVISION_FILTER = "ALL_TEAMS_DIVISION_FILTER";
const ALL_TEAMS_STATUS_FILTER = "ALL_TEAMS_STATUS_FILTER";
const ACTIVE_TEAMS_STATUS_FILTER = "ACTIVE_TEAMS_STATUS_FILTER";
const INACTIVE_TEAMS_STATUS_FILTER = "INACTIVE_TEAMS_STATUS_FILTER";

function resolveTeamDivisionLabel(division: TeamDivision | null): string {
  if (!division) {
    return TEAM_DIVISION_SELECTION_LABELS[TeamDivisionSelection.WITHOUT_DIVISION];
  }

  return TEAM_DIVISION_LABELS[division];
}

function resolveTeamDivisionBadgeTone(division: TeamDivision | null): AppBadgeTone {
  if (!division) {
    return AppBadgeTone.AMBER;
  }

  return TEAM_DIVISION_BADGE_TONES[division];
}

function resolveTeamDivisionSelection(division: TeamDivision | null): TeamDivisionSelection {
  if (!division) {
    return TeamDivisionSelection.WITHOUT_DIVISION;
  }

  return division == TeamDivision.DIVISAO_PRINCIPAL
    ? TeamDivisionSelection.DIVISAO_PRINCIPAL
    : TeamDivisionSelection.DIVISAO_ACESSO;
}

function resolveTeamDivisionBySelection(selection: TeamDivisionSelection): TeamDivision | null {
  if (selection == TeamDivisionSelection.WITHOUT_DIVISION) {
    return null;
  }

  return selection;
}

export function AdminTeams({ teams, onRefetch, canManageTeams = true }: Props) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("Joinville");
  const [division, setDivision] = useState<TeamDivision | null>(TeamDivision.DIVISAO_ACESSO);
  const [teamSearch, setTeamSearch] = useState("");
  const [divisionFilter, setDivisionFilter] = useState<string>(ALL_TEAMS_DIVISION_FILTER);
  const [statusFilter, setStatusFilter] = useState<string>(ACTIVE_TEAMS_STATUS_FILTER);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showEditTeamModal, setShowEditTeamModal] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [editingTeamCity, setEditingTeamCity] = useState("Joinville");
  const [editingTeamDivision, setEditingTeamDivision] = useState<TeamDivision | null>(TeamDivision.DIVISAO_ACESSO);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [savingTeam, setSavingTeam] = useState(false);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);
  const [togglingTeamId, setTogglingTeamId] = useState<string | null>(null);

  const filteredTeams = useMemo(() => {
    const normalizedTeamSearch = teamSearch.trim().toLowerCase();

    return teams.filter((team) => {
      if (
        divisionFilter != ALL_TEAMS_DIVISION_FILTER &&
        resolveTeamDivisionSelection(team.division) != divisionFilter
      ) {
        return false;
      }

      if (statusFilter == ACTIVE_TEAMS_STATUS_FILTER && team.is_active == false) {
        return false;
      }

      if (statusFilter == INACTIVE_TEAMS_STATUS_FILTER && team.is_active != false) {
        return false;
      }

      if (normalizedTeamSearch.length == 0) {
        return true;
      }

      return `${team.name} ${team.city}`.toLowerCase().includes(normalizedTeamSearch);
    });
  }, [divisionFilter, statusFilter, teamSearch, teams]);

  const resetCreateTeamForm = () => {
    setName("");
    setCity("Joinville");
    setDivision(TeamDivision.DIVISAO_ACESSO);
  };

  const handleOpenCreateTeamModal = () => {
    resetCreateTeamForm();
    setShowCreateTeamModal(true);
  };

  const resetEditTeamForm = () => {
    setEditingTeamId(null);
    setEditingTeamName("");
    setEditingTeamCity("Joinville");
    setEditingTeamDivision(TeamDivision.DIVISAO_ACESSO);
  };

  const handleCloseEditTeamModal = () => {
    setShowEditTeamModal(false);
    resetEditTeamForm();
  };

  const handleAdd = async () => {
    if (!canManageTeams || creatingTeam) {
      return;
    }

    if (!name.trim()) {
      toast.error("Informe o nome da atlética.");
      return;
    }

    setCreatingTeam(true);

    const { error } = await supabase.from("teams").insert({
      name: name.trim(),
      city,
      division,
      is_active: true,
    });

    setCreatingTeam(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Atlética criada!");
    setShowCreateTeamModal(false);
    resetCreateTeamForm();
    onRefetch();
  };

  const handleDelete = async (teamId: string) => {
    if (!canManageTeams || deletingTeamId != null) {
      return;
    }

    setDeletingTeamId(teamId);

    const { error } = await supabase.from("teams").delete().eq("id", teamId);

    setDeletingTeamId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Atlética removida.");
    onRefetch();
  };

  const handleOpenEditTeamModal = (team: Team) => {
    if (!canManageTeams) {
      return;
    }

    setEditingTeamId(team.id);
    setEditingTeamName(team.name);
    setEditingTeamCity(team.city);
    setEditingTeamDivision(team.division);
    setShowEditTeamModal(true);
  };

  const handleToggleTeamActive = async (team: Team) => {
    if (!canManageTeams || togglingTeamId != null) {
      return;
    }

    setTogglingTeamId(team.id);

    const { error } = await supabase
      .from("teams")
      .update({
        is_active: !team.is_active,
      })
      .eq("id", team.id);

    setTogglingTeamId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(team.is_active ? "Atlética inativada." : "Atlética reativada.");
    onRefetch();
  };

  const handleSaveTeam = async () => {
    if (!canManageTeams || savingTeam) {
      return;
    }

    if (!editingTeamId) {
      return;
    }

    const normalizedTeamName = editingTeamName.trim();

    if (!normalizedTeamName) {
      toast.error("Informe o nome da atlética.");
      return;
    }

    setSavingTeam(true);

    const { error } = await supabase
      .from("teams")
      .update({
        name: normalizedTeamName,
        city: editingTeamCity,
        division: editingTeamDivision,
      })
      .eq("id", editingTeamId);

    setSavingTeam(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Atlética atualizada.");
    handleCloseEditTeamModal();
    onRefetch();
  };

  return (
    <div className="space-y-4">
      <div className="glass-card enter-section flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3">
          <Input
            type="search"
            value={teamSearch}
            onChange={(event) => setTeamSearch(event.target.value)}
            placeholder="Buscar atlética por nome"
            className="app-input-field"
            autoComplete="off"
          />

          <Select value={divisionFilter} onValueChange={setDivisionFilter}>
            <SelectTrigger className="app-input-field">
              <SelectValue placeholder="Filtrar por divisão" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TEAMS_DIVISION_FILTER}>Todas as divisões</SelectItem>
              <SelectItem value={TeamDivisionSelection.DIVISAO_PRINCIPAL}>
                {TEAM_DIVISION_SELECTION_LABELS[TeamDivisionSelection.DIVISAO_PRINCIPAL]}
              </SelectItem>
              <SelectItem value={TeamDivisionSelection.DIVISAO_ACESSO}>
                {TEAM_DIVISION_SELECTION_LABELS[TeamDivisionSelection.DIVISAO_ACESSO]}
              </SelectItem>
              <SelectItem value={TeamDivisionSelection.WITHOUT_DIVISION}>
                {TEAM_DIVISION_SELECTION_LABELS[TeamDivisionSelection.WITHOUT_DIVISION]}
              </SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="app-input-field">
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TEAMS_STATUS_FILTER}>Ativas e inativas</SelectItem>
              <SelectItem value={ACTIVE_TEAMS_STATUS_FILTER}>Somente ativas</SelectItem>
              <SelectItem value={INACTIVE_TEAMS_STATUS_FILTER}>Somente inativas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canManageTeams ? (
          <Button type="button" onClick={handleOpenCreateTeamModal} className="w-full xl:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Criar atlética
          </Button>
        ) : null}
      </div>

      {!canManageTeams ? (
        <p className="text-sm text-muted-foreground">Perfil em visualização: sem permissão para editar atléticas.</p>
      ) : null}

      {filteredTeams.length == 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma atlética encontrada para os filtros selecionados.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filteredTeams.map((team) => {
            const shouldDimInactiveTeam =
              statusFilter == ALL_TEAMS_STATUS_FILTER && team.is_active == false;

            return (
            <div
              key={team.id}
              className={`list-item-card list-item-card-hover space-y-3 p-3 transition-opacity ${
                shouldDimInactiveTeam ? "opacity-70" : ""
              }`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display font-semibold leading-tight">{team.name}</p>
                    <AppBadge tone={resolveTeamDivisionBadgeTone(team.division)}>
                      {resolveTeamDivisionLabel(team.division)}
                    </AppBadge>
                    <AppBadge tone={team.is_active != false ? AppBadgeTone.EMERALD : AppBadgeTone.RED}>
                      {team.is_active != false ? "Ativa" : "Inativa"}
                    </AppBadge>
                  </div>
                </div>

                {canManageTeams ? (
                  <div className="justify-self-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Ações da atlética ${team.name}`}
                          disabled={deletingTeamId != null || togglingTeamId != null}
                        >
                          {deletingTeamId == team.id || togglingTeamId == team.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreVertical className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onSelect={() => handleOpenEditTeamModal(team)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleToggleTeamActive(team)}>
                          <Power className="mr-2 h-4 w-4" />
                          {team.is_active != false ? "Inativar" : "Ativar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => handleDelete(team.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Apagar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">{team.city}</p>
            </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={showCreateTeamModal}
        onOpenChange={(isOpen) => {
          setShowCreateTeamModal(isOpen);

          if (!isOpen) {
            resetCreateTeamForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Criar atlética</DialogTitle>
            <DialogDescription>Cadastre a atlética e defina a cidade e a divisão dela.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Input
              placeholder="Nome da atlética"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="app-input-field"
              autoComplete="off"
            />

            <Select value={city} onValueChange={setCity}>
              <SelectTrigger className="app-input-field">
                <SelectValue placeholder="Cidade" />
              </SelectTrigger>
              <SelectContent>
                {TEAM_CITY_OPTIONS.map((cityOption) => (
                  <SelectItem key={cityOption} value={cityOption}>
                    {cityOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={resolveTeamDivisionSelection(division)}
              onValueChange={(value) => {
                if (isTeamDivisionSelection(value)) {
                  setDivision(resolveTeamDivisionBySelection(value));
                }
              }}
            >
              <SelectTrigger className="app-input-field">
                <SelectValue placeholder="Divisão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TeamDivisionSelection.DIVISAO_PRINCIPAL}>
                  {TEAM_DIVISION_SELECTION_LABELS[TeamDivisionSelection.DIVISAO_PRINCIPAL]}
                </SelectItem>
                <SelectItem value={TeamDivisionSelection.DIVISAO_ACESSO}>
                  {TEAM_DIVISION_SELECTION_LABELS[TeamDivisionSelection.DIVISAO_ACESSO]}
                </SelectItem>
                <SelectItem value={TeamDivisionSelection.WITHOUT_DIVISION}>
                  {TEAM_DIVISION_SELECTION_LABELS[TeamDivisionSelection.WITHOUT_DIVISION]}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowCreateTeamModal(false)} disabled={creatingTeam}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleAdd} disabled={creatingTeam}>
              {creatingTeam ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Criar atlética
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showEditTeamModal}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handleCloseEditTeamModal();
          } else {
            setShowEditTeamModal(true);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar atlética</DialogTitle>
            <DialogDescription>Atualize as informações da atlética selecionada.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Input
              placeholder="Nome da atlética"
              value={editingTeamName}
              onChange={(event) => setEditingTeamName(event.target.value)}
              className="app-input-field"
              autoComplete="off"
            />

            <Select value={editingTeamCity} onValueChange={setEditingTeamCity}>
              <SelectTrigger className="app-input-field">
                <SelectValue placeholder="Cidade" />
              </SelectTrigger>
              <SelectContent>
                {TEAM_CITY_OPTIONS.map((cityOption) => (
                  <SelectItem key={cityOption} value={cityOption}>
                    {cityOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={resolveTeamDivisionSelection(editingTeamDivision)}
              onValueChange={(value) => {
                if (isTeamDivisionSelection(value)) {
                  setEditingTeamDivision(resolveTeamDivisionBySelection(value));
                }
              }}
            >
              <SelectTrigger className="app-input-field">
                <SelectValue placeholder="Divisão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TeamDivisionSelection.DIVISAO_PRINCIPAL}>
                  {TEAM_DIVISION_SELECTION_LABELS[TeamDivisionSelection.DIVISAO_PRINCIPAL]}
                </SelectItem>
                <SelectItem value={TeamDivisionSelection.DIVISAO_ACESSO}>
                  {TEAM_DIVISION_SELECTION_LABELS[TeamDivisionSelection.DIVISAO_ACESSO]}
                </SelectItem>
                <SelectItem value={TeamDivisionSelection.WITHOUT_DIVISION}>
                  {TEAM_DIVISION_SELECTION_LABELS[TeamDivisionSelection.WITHOUT_DIVISION]}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-3 pt-2 sm:gap-2 sm:pt-0">
            <Button type="button" variant="outline" onClick={handleCloseEditTeamModal} disabled={savingTeam}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSaveTeam} disabled={savingTeam}>
              {savingTeam ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
