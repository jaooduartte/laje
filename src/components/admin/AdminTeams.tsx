import { useState } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Team } from "@/lib/types";
import { TeamDivision } from "@/lib/enums";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TEAM_DIVISION_LABELS, isTeamDivision } from "@/lib/championship";

interface Props {
  teams: Team[];
  onRefetch: () => void;
}

const TEAM_CITY_OPTIONS = ["Joinville", "Blumenau", "Jaraguá do Sul"] as const;

const TEAM_DIVISION_BADGE_CLASS_NAMES: Record<TeamDivision, string> = {
  [TeamDivision.DIVISAO_PRINCIPAL]: "border border-primary/30 bg-primary/10 text-primary",
  [TeamDivision.DIVISAO_ACESSO]: "border border-blue-300/70 bg-blue-100 text-blue-700",
};

export function AdminTeams({ teams, onRefetch }: Props) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("Joinville");
  const [division, setDivision] = useState<TeamDivision>(TeamDivision.DIVISAO_ACESSO);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [editingTeamCity, setEditingTeamCity] = useState("Joinville");
  const [editingTeamDivision, setEditingTeamDivision] = useState<TeamDivision>(TeamDivision.DIVISAO_ACESSO);

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

  const handleStartEditingTeam = (team: Team) => {
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
      <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Input
          placeholder="Nome da atlética"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="bg-secondary border-border"
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

        <Button onClick={handleAdd} className="w-full md:w-auto">
          <Plus className="mr-1 h-4 w-4" /> Adicionar
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {teams.map((team) => (
          <div key={team.id} className="space-y-3 rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {editingTeamId === team.id ? (
                  <Input
                    value={editingTeamName}
                    onChange={(event) => setEditingTeamName(event.target.value)}
                    className="h-8 bg-secondary border-border"
                  />
                ) : (
                  <p className="font-display font-semibold leading-tight">{team.name}</p>
                )}
              </div>

              <div className="shrink-0">
                {editingTeamId === team.id ? (
                  <Select value={editingTeamCity} onValueChange={setEditingTeamCity}>
                    <SelectTrigger className="h-8 w-40 bg-secondary border-border">
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
                  <Badge className={TEAM_DIVISION_BADGE_CLASS_NAMES[team.division]}>
                    {TEAM_DIVISION_LABELS[team.division]}
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {editingTeamId === team.id ? (
                <Select
                  value={editingTeamDivision}
                  onValueChange={(value) => {
                    if (isTeamDivision(value)) {
                      setEditingTeamDivision(value);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 w-full bg-secondary border-border">
                    <SelectValue placeholder={TEAM_DIVISION_LABELS[editingTeamDivision]} />
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
              ) : (
                <p className="text-xs text-muted-foreground">{team.city}</p>
              )}

              <div className="flex items-center justify-end gap-1">
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
          </div>
        ))}
      </div>
    </div>
  );
}
