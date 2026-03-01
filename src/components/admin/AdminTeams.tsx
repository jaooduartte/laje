import { useState } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Team } from "@/lib/types";
import { TeamDivision, TeamDivisionSelection } from "@/lib/enums";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
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

function resolveTeamDivisionLabel(division: TeamDivision | null): string {
  if (!division) {
    return TEAM_DIVISION_SELECTION_LABELS[TeamDivisionSelection.WITHOUT_DIVISION];
  }

  return TEAM_DIVISION_LABELS[division];
}

function resolveTeamDivisionBadgeClassName(division: TeamDivision | null): string {
  if (!division) {
    return "border border-amber-300/70 bg-amber-100 text-amber-700";
  }

  if (division == TeamDivision.DIVISAO_PRINCIPAL) {
    return "border border-primary/30 bg-primary/10 text-primary";
  }

  return "border border-blue-300/70 bg-blue-100 text-blue-700";
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
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [editingTeamCity, setEditingTeamCity] = useState("Joinville");
  const [editingTeamDivision, setEditingTeamDivision] = useState<TeamDivision | null>(TeamDivision.DIVISAO_ACESSO);

  const handleAdd = async () => {
    if (!canManageTeams) {
      return;
    }

    if (!name.trim()) {
      toast.error("Informe o nome da atlética.");
      return;
    }

    const { error } = await supabase.from("teams").insert({
      name: name.trim(),
      city,
      division,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Atlética criada!");
    setName("");
    setDivision(TeamDivision.DIVISAO_ACESSO);
    onRefetch();
  };

  const handleDelete = async (teamId: string) => {
    if (!canManageTeams) {
      return;
    }

    const { error } = await supabase.from("teams").delete().eq("id", teamId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Atlética removida.");
    onRefetch();
  };

  const handleStartEditingTeam = (team: Team) => {
    if (!canManageTeams) {
      return;
    }

    setEditingTeamId(team.id);
    setEditingTeamName(team.name);
    setEditingTeamCity(team.city);
    setEditingTeamDivision(team.division);
  };

  const handleCancelEditingTeam = () => {
    setEditingTeamId(null);
    setEditingTeamName("");
    setEditingTeamCity("Joinville");
    setEditingTeamDivision(TeamDivision.DIVISAO_ACESSO);
  };

  const handleSaveTeam = async () => {
    if (!canManageTeams) {
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

    const { error } = await supabase
      .from("teams")
      .update({
        name: normalizedTeamName,
        city: editingTeamCity,
        division: editingTeamDivision,
      })
      .eq("id", editingTeamId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Atlética atualizada.");
    handleCancelEditingTeam();
    onRefetch();
  };

  return (
    <div className="space-y-4">
      {canManageTeams ? (
        <div className="glass-card enter-section grid gap-2 p-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Input
            placeholder="Nome da atlética"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="glass-input"
          />

          <Select value={city} onValueChange={setCity}>
            <SelectTrigger className="glass-input">
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
            <SelectTrigger className="glass-input">
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

          <Button onClick={handleAdd} className="w-full md:w-auto">
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Perfil em visualização: sem permissão para editar atléticas.</p>
      )}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {teams.map((team) => (
          <div key={team.id} className="enter-item space-y-3 glass-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {editingTeamId === team.id ? (
                  <Input
                    value={editingTeamName}
                    onChange={(event) => setEditingTeamName(event.target.value)}
                    className="h-8 glass-input"
                  />
                ) : (
                  <p className="font-display font-semibold leading-tight">{team.name}</p>
                )}
              </div>

              <div className="shrink-0">
                {editingTeamId === team.id ? (
                  <Select value={editingTeamCity} onValueChange={setEditingTeamCity}>
                    <SelectTrigger className="h-8 w-40 glass-input">
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
                ) : (
                  <Badge className={resolveTeamDivisionBadgeClassName(team.division)}>
                    {resolveTeamDivisionLabel(team.division)}
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {editingTeamId === team.id ? (
                <Select
                  value={resolveTeamDivisionSelection(editingTeamDivision)}
                  onValueChange={(value) => {
                    if (isTeamDivisionSelection(value)) {
                      setEditingTeamDivision(resolveTeamDivisionBySelection(value));
                    }
                  }}
                >
                  <SelectTrigger className="h-8 w-full glass-input">
                    <SelectValue placeholder={resolveTeamDivisionLabel(editingTeamDivision)} />
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
              ) : (
                <p className="text-xs text-muted-foreground">{team.city}</p>
              )}

              <div className="flex items-center justify-end gap-1">
                {canManageTeams && editingTeamId === team.id ? (
                  <>
                    <Button variant="ghost" size="icon" onClick={handleSaveTeam}>
                      <Save className="h-4 w-4 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleCancelEditingTeam}>
                      <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </>
                ) : canManageTeams ? (
                  <Button variant="ghost" size="icon" onClick={() => handleStartEditingTeam(team)}>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                ) : null}

                {canManageTeams ? (
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(team.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
