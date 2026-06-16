import { describe, expect, it } from "vitest";
import {
  BRACKET_KNOCKOUT_PRIORITY_PHASE_LABELS,
  resolveBracketKnockoutPriorityCardTitle,
  resolveBracketKnockoutPriorityDivisionScopeLabel,
  resolveBracketKnockoutPriorityHelperText,
} from "@/components/admin/adminKnockoutCourtPriority.utils";
import { TeamDivision } from "@/lib/enums";

describe("adminKnockoutCourtPriority utils", () => {
  it("resolve os rótulos das fases do mata-mata", () => {
    expect(BRACKET_KNOCKOUT_PRIORITY_PHASE_LABELS.SEMIFINAL).toBe("Semifinal");
    expect(BRACKET_KNOCKOUT_PRIORITY_PHASE_LABELS.FINAL).toBe("Final");
  });

  it("resolve o escopo ALL como todas as divisões", () => {
    expect(resolveBracketKnockoutPriorityDivisionScopeLabel("ALL")).toBe("Todas as divisões");
  });

  it("monta o título da semifinal com divisão quando aplicável", () => {
    expect(
      resolveBracketKnockoutPriorityCardTitle({
        phase: "SEMIFINAL",
        divisionScope: TeamDivision.DIVISAO_PRINCIPAL,
      }),
    ).toBe("Semifinal • Divisão Principal");
  });

  it("mantém a final sem sufixo de divisão", () => {
    expect(
      resolveBracketKnockoutPriorityCardTitle({
        phase: "FINAL",
        divisionScope: "ALL",
      }),
    ).toBe("Final");
  });

  it("explica o fallback padrão da semifinal do acesso", () => {
    expect(
      resolveBracketKnockoutPriorityHelperText({
        phase: "SEMIFINAL",
        divisionScope: TeamDivision.DIVISAO_ACESSO,
      }),
    ).toContain("segunda quadra compatível");
  });
});
