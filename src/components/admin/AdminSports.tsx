import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
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
  championships: Championship[];
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

type SportVisibilityFilter = "ALL" | "LINKED" | "UNLINKED";

const ALL_CHAMPIONSHIPS_FILTER_VALUE = "ALL_CHAMPIONSHIPS";

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

const SPORT_VISIBILITY_FILTER_LABELS: Record<SportVisibilityFilter, string> = {
  ALL: "Todas",
  LINKED: "Vinculadas",
  UNLINKED: "Não vinculadas",
};

function isSportVisibilityFilter(value: string): value is SportVisibilityFilter {
  return value === "ALL" || value === "LINKED" || value === "UNLINKED";
}

function parsePointsDraft(pointsDraft: PointsDraft) {
  const pointsWin = Number(pointsDraft.pointsWin);
  const pointsDraw = Number(pointsDraft.pointsDraw);
  const pointsLoss = Number(pointsDraft.pointsLoss);

  if (Number.isNaN(pointsWin) || Number.isNaN(pointsDraw) || Number.isNaN(pointsLoss)) {
    return null;
  }

  return {
    pointsWin,
    pointsDraw,
    pointsLoss,
  };
}

export function AdminSports({
  sports,
  championships,
  championshipSports,
  selectedChampionship,
  onRefetchSports,
  onRefetchChampionshipSports,
}: Props) {
  const [createChampionshipId, setCreateChampionshipId] = useState(selectedChampionship.id);
  const [championshipFilterId, setChampionshipFilterId] = useState<string>(ALL_CHAMPIONSHIPS_FILTER_VALUE);
  const [sportVisibilityFilter, setSportVisibilityFilter] = useState<SportVisibilityFilter>("ALL");
  const [championshipSportsByFilter, setChampionshipSportsByFilter] = useState<ChampionshipSport[]>([]);
  const [loadingChampionshipSportsByFilter, setLoadingChampionshipSportsByFilter] = useState(false);

  const [createName, setCreateName] = useState("");
  const [createNaipeMode, setCreateNaipeMode] = useState<ChampionshipSportNaipeMode>(
    DEFAULT_CHAMPIONSHIP_SPORT_NAIPE_MODE,
  );
  const [createPointsDraft, setCreatePointsDraft] = useState<PointsDraft>(DEFAULT_POINTS_DRAFT);

  const [editingSportId, setEditingSportId] = useState<string | null>(null);
  const [editingSportName, setEditingSportName] = useState("");
  const [editingShouldBeLinked, setEditingShouldBeLinked] = useState(false);
  const [editingNaipeMode, setEditingNaipeMode] = useState<ChampionshipSportNaipeMode>(
    DEFAULT_CHAMPIONSHIP_SPORT_NAIPE_MODE,
  );
  const [editingPointsDraft, setEditingPointsDraft] = useState<PointsDraft>(DEFAULT_POINTS_DRAFT);

  const isAllChampionshipFilter = championshipFilterId === ALL_CHAMPIONSHIPS_FILTER_VALUE;

  const selectedChampionshipForCreate = useMemo(() => {
    return championships.find((championship) => championship.id === createChampionshipId) ?? selectedChampionship;
  }, [championships, createChampionshipId, selectedChampionship]);

  const selectedChampionshipForFilter = useMemo(() => {
    if (isAllChampionshipFilter) {
      return null;
    }

    return championships.find((championship) => championship.id === championshipFilterId) ?? selectedChampionship;
  }, [championships, championshipFilterId, isAllChampionshipFilter, selectedChampionship]);

  const fetchChampionshipSportsByFilter = useCallback(async (filterValue: string) => {
    setLoadingChampionshipSportsByFilter(true);

    let query = supabase
      .from("championship_sports")
      .select("*, sports(*), championships(*)")
      .order("created_at", { ascending: true });

    if (filterValue !== ALL_CHAMPIONSHIPS_FILTER_VALUE) {
      query = query.eq("championship_id", filterValue);
    }

    const { data, error } = await query;

    setLoadingChampionshipSportsByFilter(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setChampionshipSportsByFilter((data as ChampionshipSport[]) ?? []);
  }, []);

  useEffect(() => {
    setCreateChampionshipId(selectedChampionship.id);
  }, [selectedChampionship.id]);

  useEffect(() => {
    if (championshipFilterId === selectedChampionship.id) {
      setChampionshipSportsByFilter(championshipSports);
      setLoadingChampionshipSportsByFilter(false);
      return;
    }

    void fetchChampionshipSportsByFilter(championshipFilterId);
  }, [championshipFilterId, selectedChampionship.id, championshipSports, fetchChampionshipSportsByFilter]);

  useEffect(() => {
    setEditingSportId(null);
    setEditingSportName("");
    setEditingShouldBeLinked(false);
    setEditingNaipeMode(DEFAULT_CHAMPIONSHIP_SPORT_NAIPE_MODE);
    setEditingPointsDraft(DEFAULT_POINTS_DRAFT);
  }, [championshipSportsByFilter]);

  const championshipSportBySportId = useMemo(() => {
    const map = new Map<string, ChampionshipSport>();

    championshipSportsByFilter.forEach((championshipSport) => {
      if (!map.has(championshipSport.sport_id)) {
        map.set(championshipSport.sport_id, championshipSport);
      }
    });

    return map;
  }, [championshipSportsByFilter]);

  const linkedChampionshipCountBySportId = useMemo(() => {
    const map = new Map<string, number>();

    championshipSportsByFilter.forEach((championshipSport) => {
      const currentCount = map.get(championshipSport.sport_id) ?? 0;
      map.set(championshipSport.sport_id, currentCount + 1);
    });

    return map;
  }, [championshipSportsByFilter]);

  const visibleSports = useMemo(() => {
    const sortedSports = [...sports].sort((firstSport, secondSport) => firstSport.name.localeCompare(secondSport.name));
    const linkedSportIds = new Set(championshipSportsByFilter.map((championshipSport) => championshipSport.sport_id));

    if (!isAllChampionshipFilter) {
      return sortedSports.filter((sport) => linkedSportIds.has(sport.id));
    }

    return sortedSports.filter((sport) => {
      const isSportLinked = linkedSportIds.has(sport.id);

      if (sportVisibilityFilter === "LINKED") {
        return isSportLinked;
      }

      if (sportVisibilityFilter === "UNLINKED") {
        return !isSportLinked;
      }

      return true;
    });
  }, [sports, championshipSportsByFilter, isAllChampionshipFilter, sportVisibilityFilter]);

  const refreshFilterData = useCallback(() => {
    if (championshipFilterId === selectedChampionship.id) {
      onRefetchChampionshipSports();
    }

    void fetchChampionshipSportsByFilter(championshipFilterId);
  }, [
    championshipFilterId,
    fetchChampionshipSportsByFilter,
    onRefetchChampionshipSports,
    selectedChampionship.id,
  ]);

  const handleAddSportWithConfiguration = async () => {
    const normalizedSportName = createName.trim();

    if (!normalizedSportName) {
      toast.error("Informe o nome da modalidade.");
      return;
    }

    const parsedCreatePointsDraft = parsePointsDraft(createPointsDraft);

    if (!parsedCreatePointsDraft) {
      toast.error("Pontuação inválida para cadastrar modalidade.");
      return;
    }

    const { data: createdSport, error: createSportError } = await supabase
      .from("sports")
      .insert({ name: normalizedSportName })
      .select("*")
      .single();

    if (createSportError || !createdSport) {
      toast.error(createSportError?.message ?? "Não foi possível criar a modalidade.");
      return;
    }

    const { error: linkSportError } = await supabase.from("championship_sports").insert({
      championship_id: createChampionshipId,
      sport_id: createdSport.id,
      naipe_mode: createNaipeMode,
      points_win: parsedCreatePointsDraft.pointsWin,
      points_draw: parsedCreatePointsDraft.pointsDraw,
      points_loss: parsedCreatePointsDraft.pointsLoss,
    });

    if (linkSportError) {
      await supabase.from("sports").delete().eq("id", createdSport.id);
      toast.error(linkSportError.message);
      return;
    }

    toast.success("Modalidade criada e vinculada ao campeonato.");
    setCreateName("");
    setCreateNaipeMode(DEFAULT_CHAMPIONSHIP_SPORT_NAIPE_MODE);
    setCreatePointsDraft(DEFAULT_POINTS_DRAFT);
    onRefetchSports();

    if (createChampionshipId === selectedChampionship.id) {
      onRefetchChampionshipSports();
    }

    if (isAllChampionshipFilter || championshipFilterId === createChampionshipId) {
      void fetchChampionshipSportsByFilter(championshipFilterId);
    }
  };

  const handleDeleteGlobalSport = async (sportId: string) => {
    const { error } = await supabase.from("sports").delete().eq("id", sportId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Modalidade removida.");
    onRefetchSports();
    refreshFilterData();
  };

  const handleStartEditingSport = (sport: Sport) => {
    const linkedChampionshipSport = championshipSportBySportId.get(sport.id);

    setEditingSportId(sport.id);
    setEditingSportName(sport.name);
    setEditingShouldBeLinked(!!linkedChampionshipSport);
    setEditingNaipeMode(linkedChampionshipSport?.naipe_mode ?? DEFAULT_CHAMPIONSHIP_SPORT_NAIPE_MODE);
    setEditingPointsDraft(
      linkedChampionshipSport
        ? {
            pointsWin: String(linkedChampionshipSport.points_win),
            pointsDraw: String(linkedChampionshipSport.points_draw),
            pointsLoss: String(linkedChampionshipSport.points_loss),
          }
        : DEFAULT_POINTS_DRAFT,
    );
  };

  const handleCancelEditingSport = () => {
    setEditingSportId(null);
    setEditingSportName("");
    setEditingShouldBeLinked(false);
    setEditingNaipeMode(DEFAULT_CHAMPIONSHIP_SPORT_NAIPE_MODE);
    setEditingPointsDraft(DEFAULT_POINTS_DRAFT);
  };

  const handleSaveSport = async (sport: Sport) => {
    if (editingSportId !== sport.id) {
      return;
    }

    const normalizedSportName = editingSportName.trim();

    if (!normalizedSportName) {
      toast.error("Informe o nome da modalidade.");
      return;
    }

    const { error: updateSportError } = await supabase.from("sports").update({ name: normalizedSportName }).eq("id", sport.id);

    if (updateSportError) {
      toast.error(updateSportError.message);
      return;
    }

    if (isAllChampionshipFilter) {
      toast.success("Modalidade atualizada.");
      handleCancelEditingSport();
      onRefetchSports();
      refreshFilterData();
      return;
    }

    const linkedChampionshipSport = championshipSportBySportId.get(sport.id);

    if (editingShouldBeLinked) {
      const parsedEditingPointsDraft = parsePointsDraft(editingPointsDraft);

      if (!parsedEditingPointsDraft) {
        toast.error("Pontuação inválida.");
        return;
      }

      if (linkedChampionshipSport) {
        const { error: updateChampionshipSportError } = await supabase
          .from("championship_sports")
          .update({
            naipe_mode: editingNaipeMode,
            points_win: parsedEditingPointsDraft.pointsWin,
            points_draw: parsedEditingPointsDraft.pointsDraw,
            points_loss: parsedEditingPointsDraft.pointsLoss,
          })
          .eq("id", linkedChampionshipSport.id);

        if (updateChampionshipSportError) {
          toast.error(updateChampionshipSportError.message);
          return;
        }
      } else {
        const { error: linkSportError } = await supabase.from("championship_sports").insert({
          championship_id: championshipFilterId,
          sport_id: sport.id,
          naipe_mode: editingNaipeMode,
          points_win: parsedEditingPointsDraft.pointsWin,
          points_draw: parsedEditingPointsDraft.pointsDraw,
          points_loss: parsedEditingPointsDraft.pointsLoss,
        });

        if (linkSportError) {
          toast.error(linkSportError.message);
          return;
        }
      }
    } else if (linkedChampionshipSport) {
      const { error: unlinkSportError } = await supabase.from("championship_sports").delete().eq("id", linkedChampionshipSport.id);

      if (unlinkSportError) {
        toast.error(unlinkSportError.message);
        return;
      }
    }

    toast.success("Modalidade atualizada.");
    handleCancelEditingSport();
    onRefetchSports();
    refreshFilterData();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-5 rounded-lg border border-border bg-card p-4">
        <h2 className="text-2xl font-display font-bold">Modalidades</h2>

        <div className="space-y-3 rounded-lg border border-border bg-background p-4">
          <div>
            <p className="font-display font-semibold">Nova modalidade</p>
            <p className="text-xs text-muted-foreground">
              Ao cadastrar, a modalidade já será vinculada em {selectedChampionshipForCreate.name} com o tipo de naipe e pontuação definidos.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Nome da modalidade</p>
              <Input
                placeholder="Ex.: Beach Soccer"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Campeonato de vínculo</p>
              <Select value={createChampionshipId} onValueChange={setCreateChampionshipId}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Campeonato" />
                </SelectTrigger>
                <SelectContent>
                  {championships.map((championship) => (
                    <SelectItem key={championship.id} value={championship.id}>
                      {championship.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Tipo de naipe</p>
              <Select
                value={createNaipeMode}
                onValueChange={(value) => {
                  if (!isChampionshipSportNaipeMode(value)) {
                    return;
                  }

                  setCreateNaipeMode(value);
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
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Vitória</p>
              <Input
                type="number"
                value={createPointsDraft.pointsWin}
                onChange={(event) =>
                  setCreatePointsDraft((previousCreatePointsDraft) => ({
                    ...previousCreatePointsDraft,
                    pointsWin: event.target.value,
                  }))
                }
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Empate</p>
              <Input
                type="number"
                value={createPointsDraft.pointsDraw}
                onChange={(event) =>
                  setCreatePointsDraft((previousCreatePointsDraft) => ({
                    ...previousCreatePointsDraft,
                    pointsDraw: event.target.value,
                  }))
                }
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Derrota</p>
              <Input
                type="number"
                value={createPointsDraft.pointsLoss}
                onChange={(event) =>
                  setCreatePointsDraft((previousCreatePointsDraft) => ({
                    ...previousCreatePointsDraft,
                    pointsLoss: event.target.value,
                  }))
                }
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-transparent select-none">Adicionar</p>
              <Button className="w-full" onClick={handleAddSportWithConfiguration}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Filtrar por campeonato</p>
            <Select value={championshipFilterId} onValueChange={setChampionshipFilterId}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue placeholder="Campeonato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CHAMPIONSHIPS_FILTER_VALUE}>Todos</SelectItem>
                {championships.map((championship) => (
                  <SelectItem key={championship.id} value={championship.id}>
                    {championship.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Exibir modalidades</p>
            <Select
              value={sportVisibilityFilter}
              onValueChange={(value) => {
                if (!isSportVisibilityFilter(value)) {
                  return;
                }

                setSportVisibilityFilter(value);
              }}
              disabled={!isAllChampionshipFilter}
            >
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue placeholder="Filtro de modalidades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{SPORT_VISIBILITY_FILTER_LABELS.ALL}</SelectItem>
                <SelectItem value="LINKED">{SPORT_VISIBILITY_FILTER_LABELS.LINKED}</SelectItem>
                <SelectItem value="UNLINKED">{SPORT_VISIBILITY_FILTER_LABELS.UNLINKED}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loadingChampionshipSportsByFilter ? (
          <p className="text-sm text-muted-foreground">Carregando configurações do campeonato...</p>
        ) : visibleSports.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma modalidade encontrada para o filtro selecionado.</p>
        ) : (
          <div className="space-y-2">
            {visibleSports.map((sport) => {
              const linkedChampionshipSport = championshipSportBySportId.get(sport.id);
              const linkedChampionshipCount = linkedChampionshipCountBySportId.get(sport.id) ?? 0;
              const isEditingSport = editingSportId === sport.id;

              return (
                <div key={sport.id} className="space-y-3 rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                      {isEditingSport ? (
                        <Input
                          value={editingSportName}
                          onChange={(event) => setEditingSportName(event.target.value)}
                          className="max-w-sm bg-secondary border-border"
                        />
                      ) : (
                        <p className="font-display font-semibold">{sport.name}</p>
                      )}

                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {isAllChampionshipFilter
                          ? linkedChampionshipCount > 0
                            ? `Vinculada em ${linkedChampionshipCount} campeonato${linkedChampionshipCount > 1 ? "s" : ""}`
                            : "Não vinculada em nenhum campeonato"
                          : `Vinculada em ${selectedChampionshipForFilter?.name ?? "campeonato selecionado"}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      {isEditingSport ? (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handleSaveSport(sport)}>
                            <Save className="h-4 w-4 text-primary" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={handleCancelEditingSport}>
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="icon" onClick={() => handleStartEditingSport(sport)}>
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}

                      <Button variant="ghost" size="icon" onClick={() => handleDeleteGlobalSport(sport.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {isEditingSport && !isAllChampionshipFilter ? (
                    <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Vínculo no campeonato</p>
                        <Select
                          value={editingShouldBeLinked ? "LINKED" : "UNLINKED"}
                          onValueChange={(value) => setEditingShouldBeLinked(value === "LINKED")}
                        >
                          <SelectTrigger className="bg-secondary border-border">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="LINKED">Vinculada</SelectItem>
                            <SelectItem value="UNLINKED">Não vinculada</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Tipo de naipe</p>
                        <Select
                          value={editingNaipeMode}
                          onValueChange={(value) => {
                            if (!isChampionshipSportNaipeMode(value)) {
                              return;
                            }

                            setEditingNaipeMode(value);
                          }}
                          disabled={!editingShouldBeLinked}
                        >
                          <SelectTrigger className="bg-secondary border-border">
                            <SelectValue />
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

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Vitória</p>
                        <Input
                          type="number"
                          value={editingPointsDraft.pointsWin}
                          onChange={(event) =>
                            setEditingPointsDraft((previousEditingPointsDraft) => ({
                              ...previousEditingPointsDraft,
                              pointsWin: event.target.value,
                            }))
                          }
                          className="bg-secondary border-border"
                          disabled={!editingShouldBeLinked}
                        />
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Empate</p>
                        <Input
                          type="number"
                          value={editingPointsDraft.pointsDraw}
                          onChange={(event) =>
                            setEditingPointsDraft((previousEditingPointsDraft) => ({
                              ...previousEditingPointsDraft,
                              pointsDraw: event.target.value,
                            }))
                          }
                          className="bg-secondary border-border"
                          disabled={!editingShouldBeLinked}
                        />
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Derrota</p>
                        <Input
                          type="number"
                          value={editingPointsDraft.pointsLoss}
                          onChange={(event) =>
                            setEditingPointsDraft((previousEditingPointsDraft) => ({
                              ...previousEditingPointsDraft,
                              pointsLoss: event.target.value,
                            }))
                          }
                          className="bg-secondary border-border"
                          disabled={!editingShouldBeLinked}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
