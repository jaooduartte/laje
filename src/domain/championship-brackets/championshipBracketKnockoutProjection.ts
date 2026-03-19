import { resolveChampionshipGroupLabel } from "@/lib/championship";

export interface ChampionshipBracketKnockoutProjectionInput {
  groups_count: number;
  qualifiers_per_group: number;
  should_complete_knockout_with_best_second_placed_teams?: boolean | null;
}

export interface ChampionshipBracketKnockoutProjection {
  direct_qualified_team_count: number;
  total_qualified_team_count: number;
  projected_bracket_size: number;
  best_second_placed_team_count: number;
  bye_count: number;
  uses_best_second_placed_teams: boolean;
}

function resolveOrdinalPlacementLabel(position: number): string {
  return `${position}º`;
}

function resolveBestPlacedLabel(position: number, placing: "1º" | "2º"): string {
  return `${resolveOrdinalPlacementLabel(position)} melhor ${placing}`;
}

function resolveProjectedBracketSize(qualified_team_count: number): number {
  if (qualified_team_count < 2) {
    return qualified_team_count;
  }

  let projected_bracket_size = 2;

  while (projected_bracket_size < qualified_team_count) {
    projected_bracket_size *= 2;
  }

  return projected_bracket_size;
}

export function resolveChampionshipBracketKnockoutProjection(
  input: ChampionshipBracketKnockoutProjectionInput,
): ChampionshipBracketKnockoutProjection {
  const groups_count = Math.max(0, input.groups_count);
  const qualifiers_per_group = Math.max(1, input.qualifiers_per_group);
  const direct_qualified_team_count = groups_count * qualifiers_per_group;
  const uses_best_second_placed_teams =
    qualifiers_per_group == 1 &&
    input.should_complete_knockout_with_best_second_placed_teams == true;
  let projected_bracket_size = resolveProjectedBracketSize(direct_qualified_team_count);

  if (uses_best_second_placed_teams && direct_qualified_team_count >= 2) {
    projected_bracket_size = 2;

    while (projected_bracket_size <= direct_qualified_team_count) {
      projected_bracket_size *= 2;
    }
  }

  const best_second_placed_team_count = uses_best_second_placed_teams
    ? Math.max(0, projected_bracket_size - direct_qualified_team_count)
    : 0;
  const total_qualified_team_count =
    direct_qualified_team_count + best_second_placed_team_count;
  const bye_count = Math.max(
    0,
    projected_bracket_size - total_qualified_team_count,
  );

  return {
    direct_qualified_team_count,
    total_qualified_team_count,
    projected_bracket_size,
    best_second_placed_team_count,
    bye_count,
    uses_best_second_placed_teams,
  };
}

export function resolveChampionshipBracketQualificationSummary(
  input: ChampionshipBracketKnockoutProjectionInput,
): string {
  const projection = resolveChampionshipBracketKnockoutProjection(input);

  if (input.qualifiers_per_group == 2) {
    return `${projection.direct_qualified_team_count} vagas: 1º e 2º de cada grupo`;
  }

  if (
    projection.uses_best_second_placed_teams &&
    projection.best_second_placed_team_count > 0
  ) {
    const bestFirstPlacedLabel = `${projection.direct_qualified_team_count} melhores 1º`;
    const bestSecondPlacedLabel = `${projection.best_second_placed_team_count} ${projection.best_second_placed_team_count == 1 ? "melhor 2º" : "melhores 2º"}`;

    return `${projection.projected_bracket_size} vagas: ${bestFirstPlacedLabel} + ${bestSecondPlacedLabel}`;
  }

  return `${projection.direct_qualified_team_count} vaga${projection.direct_qualified_team_count == 1 ? "" : "s"}: 1º de cada grupo`;
}

export function resolveChampionshipBracketProjectedKnockoutSummary(
  input: ChampionshipBracketKnockoutProjectionInput,
): string {
  const projection = resolveChampionshipBracketKnockoutProjection(input);

  if (projection.projected_bracket_size < 2) {
    return "Sem mata-mata projetado";
  }

  if (projection.bye_count > 0) {
    return `Chave projetada de ${projection.projected_bracket_size} com ${projection.bye_count} ${projection.bye_count == 1 ? "BYE" : "BYEs"}`;
  }

  return `Chave projetada de ${projection.projected_bracket_size}`;
}

export function resolveChampionshipBracketSeedPlaceholderLabels(
  input: ChampionshipBracketKnockoutProjectionInput,
): string[] {
  const projection = resolveChampionshipBracketKnockoutProjection(input);
  const seed_labels: string[] = [];

  if (projection.projected_bracket_size < 2) {
    return seed_labels;
  }

  if (
    projection.uses_best_second_placed_teams &&
    projection.best_second_placed_team_count > 0
  ) {
    for (
      let firstPlaceIndex = 1;
      firstPlaceIndex <= input.groups_count;
      firstPlaceIndex += 1
    ) {
      seed_labels.push(resolveBestPlacedLabel(firstPlaceIndex, "1º"));
    }

    for (
      let secondPlaceIndex = 1;
      secondPlaceIndex <= projection.best_second_placed_team_count;
      secondPlaceIndex += 1
    ) {
      seed_labels.push(resolveBestPlacedLabel(secondPlaceIndex, "2º"));
    }
  } else {
    for (
      let group_number = 1;
      group_number <= input.groups_count;
      group_number += 1
    ) {
      seed_labels.push(`1º do ${resolveChampionshipGroupLabel(group_number)}`);
    }

    if (input.qualifiers_per_group == 2) {
      for (
        let group_number = 1;
        group_number <= input.groups_count;
        group_number += 1
      ) {
        seed_labels.push(`2º do ${resolveChampionshipGroupLabel(group_number)}`);
      }
    }
  }

  while (seed_labels.length < projection.projected_bracket_size) {
    seed_labels.push("BYE");
  }

  return seed_labels;
}
