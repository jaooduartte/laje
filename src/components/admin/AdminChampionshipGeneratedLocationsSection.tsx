import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MapPinned } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getBracketGeneratedLocationGroups,
  updateBracketGeneratedLocationGroup,
} from "@/domain/championship-brackets/championshipBracket.repository";
import type { BracketGeneratedLocationGroup } from "@/domain/championship-brackets/championshipBracket.types";

interface Props {
  bracketEditionId: string;
  isEditable: boolean;
  onSaved: () => void;
}

interface LocationGroupDraft extends BracketGeneratedLocationGroup {
  saving: boolean;
}

export function AdminChampionshipGeneratedLocationsSection({
  bracketEditionId,
  isEditable,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [locationGroups, setLocationGroups] = useState<LocationGroupDraft[]>([]);
  const [savedSnapshotByGroupId, setSavedSnapshotByGroupId] = useState<Record<string, BracketGeneratedLocationGroup>>({});

  const loadLocationGroups = useCallback(async () => {
    setLoading(true);

    const { data, error } = await getBracketGeneratedLocationGroups(bracketEditionId);

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setLocationGroups(data.map((group) => ({ ...group, saving: false })));
    setSavedSnapshotByGroupId(
      data.reduce<Record<string, BracketGeneratedLocationGroup>>((carry, group) => {
        carry[group.location_group_id] = group;
        return carry;
      }, {}),
    );
    setLoading(false);
  }, [bracketEditionId]);

  useEffect(() => {
    void loadLocationGroups();
  }, [loadLocationGroups]);

  const orderedLocationGroups = useMemo(
    () => [...locationGroups].sort((leftGroup, rightGroup) => leftGroup.position - rightGroup.position),
    [locationGroups],
  );

  function updateLocationGroup(
    locationGroupId: string,
    updater: (currentGroup: LocationGroupDraft) => LocationGroupDraft,
  ) {
    setLocationGroups((previousGroups) =>
      previousGroups.map((group) =>
        group.location_group_id === locationGroupId ? updater(group) : group,
      ),
    );
  }

  function isLocationGroupDirty(group: LocationGroupDraft): boolean {
    const savedGroup = savedSnapshotByGroupId[group.location_group_id];

    if (!savedGroup) {
      return false;
    }

    if (group.location_name !== savedGroup.location_name) {
      return true;
    }

    if (group.courts.length !== savedGroup.courts.length) {
      return true;
    }

    return group.courts.some((court) => {
      const savedCourt = savedGroup.courts.find(
        (savedCourtItem) => savedCourtItem.court_group_id === court.court_group_id,
      );

      return !savedCourt || savedCourt.court_name !== court.court_name;
    });
  }

  async function saveLocationGroup(group: LocationGroupDraft) {
    updateLocationGroup(group.location_group_id, (currentGroup) => ({ ...currentGroup, saving: true }));

    const { error } = await updateBracketGeneratedLocationGroup(bracketEditionId, {
      location_group_id: group.location_group_id,
      location_name: group.location_name,
      courts: group.courts.map((court) => ({
        court_group_id: court.court_group_id,
        court_name: court.court_name,
      })),
    });

    if (error) {
      toast.error(error.message);
      updateLocationGroup(group.location_group_id, (currentGroup) => ({ ...currentGroup, saving: false }));
      return;
    }

    toast.success(`Local atualizado: ${group.location_name}.`);
    await loadLocationGroups();
    onSaved();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (orderedLocationGroups.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        Nenhum local gerado foi encontrado para esta edição.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          Edite os nomes dos locais e das quadras geradas para este campeonato. A alteração vale
          para toda a edição atual.
        </p>
      </div>

      {orderedLocationGroups.map((group) => {
        const isDirty = isLocationGroupDirty(group);

        return (
          <div key={group.location_group_id} className="glass-card space-y-4 p-4">
            <div className="flex items-center gap-2">
              <MapPinned className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-medium">Local e quadras da edição</h4>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="space-y-2 rounded-2xl app-card-muted p-3">
                <Label
                  htmlFor={`generated-location-name-${group.location_group_id}`}
                  className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Nome do local
                </Label>
                <Input
                  id={`generated-location-name-${group.location_group_id}`}
                  value={group.location_name}
                  disabled={!isEditable || group.saving}
                  onChange={(event) =>
                    updateLocationGroup(group.location_group_id, (currentGroup) => ({
                      ...currentGroup,
                      location_name: event.target.value,
                    }))
                  }
                  className="app-input-field"
                />
              </div>

              <div className="space-y-3 rounded-2xl app-card-muted p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Quadras desse local
                </p>

                <div className="space-y-2">
                  {group.courts.map((court) => (
                    <div
                      key={court.court_group_id}
                      className="grid gap-2 rounded-xl border border-border/60 bg-background/40 p-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center"
                    >
                      <span className="text-sm font-medium text-foreground">
                        Quadra {court.position}
                      </span>
                      <Input
                        value={court.court_name}
                        disabled={!isEditable || group.saving}
                        onChange={(event) =>
                          updateLocationGroup(group.location_group_id, (currentGroup) => ({
                            ...currentGroup,
                            courts: currentGroup.courts.map((currentCourt) =>
                              currentCourt.court_group_id === court.court_group_id
                                ? { ...currentCourt, court_name: event.target.value }
                                : currentCourt,
                            ),
                          }))
                        }
                        className="app-input-field"
                      />
                    </div>
                  ))}
                </div>

                {isEditable ? (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!isDirty || group.saving}
                      onClick={() => void saveLocationGroup(group)}
                    >
                      {group.saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                      Salvar local e quadras
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
