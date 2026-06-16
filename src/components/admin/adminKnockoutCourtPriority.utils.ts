import type {
  BracketKnockoutPriorityDivisionScope,
  BracketKnockoutPriorityPhase,
} from "@/domain/championship-brackets/championshipBracket.types";
import { TEAM_DIVISION_LABELS } from "@/lib/championship";
import { TeamDivision } from "@/lib/enums";

export const BRACKET_KNOCKOUT_PRIORITY_PHASE_LABELS: Record<BracketKnockoutPriorityPhase, string> = {
  SEMIFINAL: "Semifinal",
  FINAL: "Final",
};

export function resolveBracketKnockoutPriorityDivisionScopeLabel(
  divisionScope: BracketKnockoutPriorityDivisionScope,
): string {
  if (divisionScope === "ALL") {
    return "Todas as divisões";
  }

  return TEAM_DIVISION_LABELS[divisionScope as TeamDivision];
}

export function resolveBracketKnockoutPriorityCardTitle(params: {
  phase: BracketKnockoutPriorityPhase;
  divisionScope: BracketKnockoutPriorityDivisionScope;
}): string {
  if (params.phase === "FINAL") {
    return "Final";
  }

  if (params.divisionScope === "ALL") {
    return "Semifinal";
  }

  return `Semifinal • ${resolveBracketKnockoutPriorityDivisionScopeLabel(params.divisionScope)}`;
}

export function resolveBracketKnockoutPriorityHelperText(params: {
  phase: BracketKnockoutPriorityPhase;
  divisionScope: BracketKnockoutPriorityDivisionScope;
}): string {
  if (params.phase === "FINAL") {
    return "Escolhe a quadra prioritária para as finais desta modalidade. Sem configuração, a agenda usa a primeira quadra compatível.";
  }

  if (params.divisionScope === TeamDivision.DIVISAO_ACESSO) {
    return "Define a quadra preferencial das semifinais da Divisão de Acesso. Sem configuração, a agenda tenta usar a segunda quadra compatível.";
  }

  if (params.divisionScope === TeamDivision.DIVISAO_PRINCIPAL) {
    return "Define a quadra preferencial das semifinais da Divisão Principal. Sem configuração, a agenda tenta usar a primeira quadra compatível.";
  }

  return "Define a quadra preferencial das semifinais desta modalidade.";
}
