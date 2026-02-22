import { useState } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Team } from "@/lib/types";
import { TeamDivision } from "@/lib/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TEAM_DIVISION_LABELS, isTeamDivision } from "@/lib/championship";

interface Props {
  teams: Team[];
  onRefetch: () => void;
}

const TEAM_CITY_OPTIONS = ["Joinville", "Blumenau", "Jaraguá do Sul"] as const;

export function AdminTeams({ teams, onRefetch }: Props) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("Joinville");
  const [division, setDivision] = useState<TeamDivision>(TeamDivision.DIVISAO_ACESSO);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [editingTeamCity, setEditingTeamCity] = useState("Joinville");

  const handleAdd = async () => {
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
    const { error } = await supabase.from("teams").delete().eq("id", teamId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Atlética removida.");
    onRefetch();
  };

  const handleDivisionUpdate = async (teamId: string, divisionValue: string) => {
    if (!isTeamDivision(divisionValue)) {
      return;
    }

    const { error } = await supabase.from("teams").update({ division: divisionValue }).eq("id", teamId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Divisão da atlética atualizada.");
    onRefetch();
  };

  const handleStartEditingTeam = (team: Team) => {
    setEditingTeamId(team.id);
    setEditingTeamName(team.name);
    setEditingTeamCity(team.city);
  };

  const handleCancelEditingTeam = () => {
    setEditingTeamId(null);
    setEditingTeamName("");
    setEditingTeamCity("Joinville");
  };

  const handleSaveTeam = async () => {
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
      <div className="grid gap-2 md:grid-cols-4">
        <Input
          placeholder="Nome da atlética"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="bg-secondary border-border md:col-span-2"
        />

        <Select value={city} onValueChange={setCity}>
          <SelectTrigger className="bg-secondary border-border">
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
          value={division}
          onValueChange={(value) => {
            if (isTeamDivision(value)) {
              setDivision(value);
            }
          }}
        >
          <SelectTrigger className="bg-secondary border-border">
            <SelectValue placeholder="Divisão" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>
              {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_PRINCIPAL]}
            </SelectItem>
            <SelectItem value={TeamDivision.DIVISAO_ACESSO}>
              {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO]}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button onClick={handleAdd}>
        <Plus className="mr-1 h-4 w-4" /> Adicionar
      </Button>

      <div className="space-y-2">
        {teams.map((team) => (
          <div
            key={team.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              {editingTeamId === team.id ? (
                <Input
                  value={editingTeamName}
                  onChange={(event) => setEditingTeamName(event.target.value)}
                  className="w-64 bg-secondary border-border"
                />
              ) : (
                <span className="font-display font-semibold">{team.name}</span>
              )}

              {editingTeamId === team.id ? (
                <Select value={editingTeamCity} onValueChange={setEditingTeamCity}>
                  <SelectTrigger className="w-52 bg-secondary border-border">
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
                <span className="ml-2 text-sm text-muted-foreground">({team.city})</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Select value={team.division} onValueChange={(value) => handleDivisionUpdate(team.id, value)}>
                <SelectTrigger className="h-8 w-48 bg-secondary border-border">
                  <SelectValue placeholder={TEAM_DIVISION_LABELS[team.division]} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TeamDivision.DIVISAO_PRINCIPAL}>
                    {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_PRINCIPAL]}
                  </SelectItem>
                  <SelectItem value={TeamDivision.DIVISAO_ACESSO}>
                    {TEAM_DIVISION_LABELS[TeamDivision.DIVISAO_ACESSO]}
                  </SelectItem>
                </SelectContent>
              </Select>

              {editingTeamId === team.id ? (
                <>
                  <Button variant="ghost" size="icon" onClick={handleSaveTeam}>
                    <Save className="h-4 w-4 text-primary" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleCancelEditingTeam}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="icon" onClick={() => handleStartEditingTeam(team)}>
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}

              <Button variant="ghost" size="icon" onClick={() => handleDelete(team.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
