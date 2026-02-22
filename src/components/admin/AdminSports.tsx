import { useEffect, useMemo, useState } from "react";
import { Link2, Pencil, Plus, Save, Trash2, Unlink, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Championship, ChampionshipSport, Sport } from "@/lib/types";
import { ChampionshipSportNaipeMode } from "@/lib/enums";
import { CHAMPIONSHIP_SPORT_NAIPE_MODE_LABELS, isChampionshipSportNaipeMode } from "@/lib/championship";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  sports: Sport[];
  championshipSports: ChampionshipSport[];
  selectedChampionship: Championship;
  onRefetchSports: () => void;
  onRefetchChampionshipSports: () => void;
}

interface PointsDraft {
  pointsWin: string;
  pointsDraw: string;
  pointsLoss: string;
}

const DEFAULT_POINTS_DRAFT: PointsDraft = {
  pointsWin: "3",
  pointsDraw: "1",
  pointsLoss: "0",
};

const DEFAULT_CHAMPIONSHIP_SPORT_NAIPE_MODE = ChampionshipSportNaipeMode.MASCULINO_FEMININO;

const CHAMPIONSHIP_SPORT_NAIPE_MODE_OPTIONS: ChampionshipSportNaipeMode[] = [
  ChampionshipSportNaipeMode.MASCULINO_FEMININO,
  ChampionshipSportNaipeMode.MISTO,
];

export function AdminSports({
  sports,
  championshipSports,
  selectedChampionship,
  onRefetchSports,
  onRefetchChampionshipSports,
}: Props) {
  const [name, setName] = useState("");
  const [editingSportId, setEditingSportId] = useState<string | null>(null);
  const [editingSportName, setEditingSportName] = useState("");
  const [pointsDraftBySportId, setPointsDraftBySportId] = useState<Record<string, PointsDraft>>({});
  const [naipeModeDraftBySportId, setNaipeModeDraftBySportId] = useState<Record<string, ChampionshipSportNaipeMode>>({});

  useEffect(() => {
    const nextPointsDraftBySportId: Record<string, PointsDraft> = {};
    const nextNaipeModeDraftBySportId: Record<string, ChampionshipSportNaipeMode> = {};

    championshipSports.forEach((championshipSport) => {
      nextPointsDraftBySportId[championshipSport.sport_id] = {
        pointsWin: String(championshipSport.points_win),
        pointsDraw: String(championshipSport.points_draw),
        pointsLoss: String(championshipSport.points_loss),
      };
      nextNaipeModeDraftBySportId[championshipSport.sport_id] = championshipSport.naipe_mode;
    });

    setPointsDraftBySportId(nextPointsDraftBySportId);
    setNaipeModeDraftBySportId(nextNaipeModeDraftBySportId);
  }, [championshipSports]);

  const championshipSportBySportId = useMemo(() => {
    return new Map(championshipSports.map((championshipSport) => [championshipSport.sport_id, championshipSport]));
  }, [championshipSports]);

  const handleAddGlobalSport = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome da modalidade.");
      return;
    }

    const { error } = await supabase.from("sports").insert({ name: name.trim() });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Modalidade criada!");
    setName("");
    onRefetchSports();
  };

  const handleDeleteGlobalSport = async (sportId: string) => {
    const { error } = await supabase.from("sports").delete().eq("id", sportId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Modalidade removida.");
    onRefetchSports();
    onRefetchChampionshipSports();
  };

  const handleStartEditingGlobalSport = (sport: Sport) => {
    setEditingSportId(sport.id);
    setEditingSportName(sport.name);
  };

  const handleCancelEditingGlobalSport = () => {
    setEditingSportId(null);
    setEditingSportName("");
  };

  const handleSaveGlobalSport = async () => {
    if (!editingSportId) {
      return;
    }

    const normalizedSportName = editingSportName.trim();

    if (!normalizedSportName) {
      toast.error("Informe o nome da modalidade.");
      return;
    }

    const { error } = await supabase.from("sports").update({ name: normalizedSportName }).eq("id", editingSportId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Modalidade atualizada.");
    handleCancelEditingGlobalSport();
    onRefetchSports();
    onRefetchChampionshipSports();
  };

  const handleLinkSportToChampionship = async (sportId: string) => {
    const naipeMode = naipeModeDraftBySportId[sportId] ?? DEFAULT_CHAMPIONSHIP_SPORT_NAIPE_MODE;
    const pointsDraft = pointsDraftBySportId[sportId] ?? DEFAULT_POINTS_DRAFT;

    const pointsWin = Number(pointsDraft.pointsWin);
    const pointsDraw = Number(pointsDraft.pointsDraw);
    const pointsLoss = Number(pointsDraft.pointsLoss);

    if (Number.isNaN(pointsWin) || Number.isNaN(pointsDraw) || Number.isNaN(pointsLoss)) {
      toast.error("Pontuação inválida.");
      return;
    }

    const { error } = await supabase.from("championship_sports").insert({
      championship_id: selectedChampionship.id,
      sport_id: sportId,
      naipe_mode: naipeMode,
      points_win: pointsWin,
      points_draw: pointsDraw,
      points_loss: pointsLoss,
    });

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Modalidade vinculada ao campeonato.");
    onRefetchChampionshipSports();
  };

  const handleUnlinkSportFromChampionship = async (championshipSportId: string) => {
    const { error } = await supabase.from("championship_sports").delete().eq("id", championshipSportId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Modalidade desvinculada do campeonato.");
    onRefetchChampionshipSports();
  };

  const handleSaveConfiguration = async (championshipSport: ChampionshipSport) => {
    const pointsDraft = pointsDraftBySportId[championshipSport.sport_id] ?? DEFAULT_POINTS_DRAFT;
    const naipeMode = naipeModeDraftBySportId[championshipSport.sport_id] ?? championshipSport.naipe_mode;

    const pointsWin = Number(pointsDraft.pointsWin);
    const pointsDraw = Number(pointsDraft.pointsDraw);
    const pointsLoss = Number(pointsDraft.pointsLoss);

    if (Number.isNaN(pointsWin) || Number.isNaN(pointsDraw) || Number.isNaN(pointsLoss)) {
      toast.error("Pontuação inválida.");
      return;
    }

    const { error } = await supabase
      .from("championship_sports")
      .update({
        naipe_mode: naipeMode,
        points_win: pointsWin,
        points_draw: pointsDraw,
        points_loss: pointsLoss,
      })
      .eq("id", championshipSport.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Configuração da modalidade atualizada.");
    onRefetchChampionshipSports();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <h3 className="font-display font-semibold">Modalidades globais</h3>

        <div className="flex gap-2">
          <Input
            placeholder="Nome da modalidade"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="bg-secondary border-border"
          />

          <Button onClick={handleAddGlobalSport}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>

        <div className="space-y-2">
          {sports.map((sport) => (
            <div
              key={sport.id}
              className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3"
            >
              {editingSportId === sport.id ? (
                <Input
                  value={editingSportName}
                  onChange={(event) => setEditingSportName(event.target.value)}
                  className="max-w-sm bg-secondary border-border"
                />
              ) : (
                <span className="font-display font-semibold">{sport.name}</span>
              )}

              <div className="flex items-center gap-1">
                {editingSportId === sport.id ? (
                  <>
                    <Button variant="ghost" size="icon" onClick={handleSaveGlobalSport}>
                      <Save className="h-4 w-4 text-primary" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleCancelEditingGlobalSport}>
                      <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="icon" onClick={() => handleStartEditingGlobalSport(sport)}>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                )}

                <Button variant="ghost" size="icon" onClick={() => handleDeleteGlobalSport(sport.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <h3 className="font-display font-semibold">Configuração de modalidade - {selectedChampionship.name}</h3>

        <div className="space-y-3">
          {sports.map((sport) => {
            const linkedChampionshipSport = championshipSportBySportId.get(sport.id);
            const naipeMode =
              naipeModeDraftBySportId[sport.id] ?? linkedChampionshipSport?.naipe_mode ?? DEFAULT_CHAMPIONSHIP_SPORT_NAIPE_MODE;
            const pointsDraft =
              pointsDraftBySportId[sport.id] ??
              (linkedChampionshipSport
                ? {
                    pointsWin: String(linkedChampionshipSport.points_win),
                    pointsDraw: String(linkedChampionshipSport.points_draw),
                    pointsLoss: String(linkedChampionshipSport.points_loss),
                  }
                : DEFAULT_POINTS_DRAFT);

            return (
              <div key={sport.id} className="space-y-3 rounded-lg border border-border bg-background px-4 py-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-display font-semibold">{sport.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {linkedChampionshipSport ? "Vinculada ao campeonato" : "Não vinculada ao campeonato"}
                    </p>
                  </div>

                  {linkedChampionshipSport ? (
                    <Button variant="outline" onClick={() => handleUnlinkSportFromChampionship(linkedChampionshipSport.id)}>
                      <Unlink className="mr-1 h-4 w-4" /> Desvincular
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => handleLinkSportToChampionship(sport.id)}>
                      <Link2 className="mr-1 h-4 w-4" /> Vincular
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Tipo de naipe</p>
                    <Select
                      value={naipeMode}
                      onValueChange={(value) => {
                        if (!isChampionshipSportNaipeMode(value)) {
                          return;
                        }

                        setNaipeModeDraftBySportId((previousNaipeModeDraftBySportId) => ({
                          ...previousNaipeModeDraftBySportId,
                          [sport.id]: value,
                        }));
                      }}
                    >
                      <SelectTrigger className="bg-secondary border-border">
                        <SelectValue placeholder="Tipo de naipe" />
                      </SelectTrigger>
                      <SelectContent>
                        {CHAMPIONSHIP_SPORT_NAIPE_MODE_OPTIONS.map((championshipSportNaipeModeOption) => (
                          <SelectItem key={championshipSportNaipeModeOption} value={championshipSportNaipeModeOption}>
                            {CHAMPIONSHIP_SPORT_NAIPE_MODE_LABELS[championshipSportNaipeModeOption]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {linkedChampionshipSport ? (
                    <>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Vitória</p>
                        <Input
                          type="number"
                          value={pointsDraft.pointsWin}
                          onChange={(event) =>
                            setPointsDraftBySportId((previousPointsDraftBySportId) => ({
                              ...previousPointsDraftBySportId,
                              [sport.id]: {
                                ...pointsDraft,
                                pointsWin: event.target.value,
                              },
                            }))
                          }
                          className="bg-secondary border-border"
                          placeholder="Pontos por vitória"
                        />
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Empate</p>
                        <Input
                          type="number"
                          value={pointsDraft.pointsDraw}
                          onChange={(event) =>
                            setPointsDraftBySportId((previousPointsDraftBySportId) => ({
                              ...previousPointsDraftBySportId,
                              [sport.id]: {
                                ...pointsDraft,
                                pointsDraw: event.target.value,
                              },
                            }))
                          }
                          className="bg-secondary border-border"
                          placeholder="Pontos por empate"
                        />
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Derrota</p>
                        <Input
                          type="number"
                          value={pointsDraft.pointsLoss}
                          onChange={(event) =>
                            setPointsDraftBySportId((previousPointsDraftBySportId) => ({
                              ...previousPointsDraftBySportId,
                              [sport.id]: {
                                ...pointsDraft,
                                pointsLoss: event.target.value,
                              },
                            }))
                          }
                          className="bg-secondary border-border"
                          placeholder="Pontos por derrota"
                        />
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-transparent select-none">Salvar</p>
                        <Button className="w-full" onClick={() => handleSaveConfiguration(linkedChampionshipSport)}>
                          <Save className="mr-1 h-4 w-4" /> Salvar
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground sm:col-span-1 lg:col-span-4 lg:self-end">
                      Defina o tipo de naipe e vincule a modalidade ao campeonato.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
