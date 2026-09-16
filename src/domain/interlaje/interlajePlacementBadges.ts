export interface InterlajePlacementContext {
  stage?: string;
  status?: string;
  reason?: string;
  final_position?: number;
  group_stage_rank?: number;
  knockout_reserved_positions?: number;
  is_knockout_participant?: boolean;
  eliminated_by_team_id?: string;
  eliminated_by_team_name?: string;
  eliminated_by_final_position?: number;
}

export interface InterlajePlacementVisualBadge {
  key: string;
  label: string;
  mobileLabel?: string;
  tone: "neutral" | "info" | "warning" | "success";
}

function readPlacementContext(
  classificationPolicy: Record<string, unknown> | null | undefined,
): InterlajePlacementContext | null {
  const rawContext = classificationPolicy?.placement_context;

  if (!rawContext || typeof rawContext != "object" || Array.isArray(rawContext)) {
    return null;
  }

  return rawContext as InterlajePlacementContext;
}

function resolveStageLabel(stage: string | undefined): string | null {
  switch (stage) {
    case "FINAL":
      return "Final";
    case "SEMIFINAL":
      return "Semifinal";
    case "QUARTERFINAL":
      return "Quartas";
    case "GROUP_STAGE":
      return "Fase de grupos";
    case "INDIVIDUAL":
      return "Classificação individual";
    default:
      return null;
  }
}

function resolveEliminatorRole(position: number | undefined): string | null {
  switch (position) {
    case 1:
      return "campeã";
    case 2:
      return "vice-campeã";
    case 3:
      return "3ª colocada";
    case 4:
      return "4ª colocada";
    default:
      return null;
  }
}

function resolvePlacementReasonLabel(
  context: InterlajePlacementContext,
): string | null {
  switch (context.reason) {
    case "CHAMPION":
      return "Campeã";
    case "RUNNER_UP":
      return "Vice-campeã";
    case "GROUP_STAGE_ELIMINATION":
      return "Eliminada na fase de grupos";
    case "GROUP_STAGE_RANKING":
      return "Classificação da fase de grupos";
    case "INDIVIDUAL_RANKING":
      return null;
    default:
      break;
  }

  const eliminatorRole = resolveEliminatorRole(
    context.eliminated_by_final_position,
  );

  if (!eliminatorRole) {
    return null;
  }

  const eliminatorName = context.eliminated_by_team_name?.trim();
  return eliminatorName
    ? `Eliminada por ${eliminatorName} (${eliminatorRole})`
    : `Eliminada pela ${eliminatorRole}`;
}

export function resolveInterlajePlacementVisualBadges(
  classificationPolicy: Record<string, unknown> | null | undefined,
): InterlajePlacementVisualBadge[] {
  const context = readPlacementContext(classificationPolicy);

  if (!context) {
    return [];
  }

  const badges: InterlajePlacementVisualBadge[] = [];
  const stageLabel = resolveStageLabel(context.stage);
  const reasonLabel = resolvePlacementReasonLabel(context);

  if (stageLabel) {
    badges.push({
      key: "interlaje-placement-stage",
      label: stageLabel,
      mobileLabel: stageLabel,
      tone: context.is_knockout_participant ? "info" : "neutral",
    });
  }

  if (reasonLabel) {
    badges.push({
      key: "interlaje-placement-reason",
      label: reasonLabel,
      mobileLabel: reasonLabel,
      tone:
        context.reason == "CHAMPION" || context.reason == "RUNNER_UP"
          ? "success"
          : "neutral",
    });
  }

  if (context.status == "PROJECTED") {
    badges.push({
      key: "projected-placement",
      label: "Colocação projetada",
      mobileLabel: "Projetada",
      tone: "warning",
    });
  }

  if (context.status == "PENDING_TIE_BREAK") {
    badges.push({
      key: "pending-placement-tie-break",
      label: "Desempate pendente",
      mobileLabel: "Desempate",
      tone: "warning",
    });
  }

  return badges;
}
