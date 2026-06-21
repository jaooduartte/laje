import { describe, expect, it } from "vitest";
import { MatchNaipe, TeamDivision } from "@/lib/enums";
import {
  resolveCompetitionKnockoutPairingModeControlValue,
  resolveDefaultCompetitionKnockoutPairingMode,
  resolveIsCrossGroupKnockoutPairingAvailable,
  resolveIsLegacyKnockoutPairingMode,
} from "@/domain/championship-brackets/championshipBracketPairing";

describe("championshipBracketPairing", () => {
  it("usa o novo cruzamento como padrão apenas para Futebol Society Feminino Divisão de Acesso", () => {
    expect(
      resolveDefaultCompetitionKnockoutPairingMode({
        sport_name: "Futebol Society",
        naipe: MatchNaipe.FEMININO,
        division: TeamDivision.DIVISAO_ACESSO,
      }),
    ).toBe("FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS");

    expect(
      resolveDefaultCompetitionKnockoutPairingMode({
        sport_name: "Futebol Society",
        naipe: MatchNaipe.FEMININO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
    ).toBe("LINEAR");
  });

  it("mantém os defaults legados das outras modalidades", () => {
    expect(
      resolveDefaultCompetitionKnockoutPairingMode({
        sport_name: "Beach Soccer",
        naipe: MatchNaipe.FEMININO,
        division: TeamDivision.DIVISAO_ACESSO,
      }),
    ).toBe("BEACH_SOCCER_FEM_DIRECT_SEMI");

    expect(
      resolveDefaultCompetitionKnockoutPairingMode({
        sport_name: "Futevôlei",
        naipe: MatchNaipe.FEMININO,
        division: TeamDivision.DIVISAO_PRINCIPAL,
      }),
    ).toBe("FUTEVOLEI_FEM_INVERTED");
  });

  it("normaliza modos legados para o controle linear sem perder a detecção de legado", () => {
    expect(
      resolveCompetitionKnockoutPairingModeControlValue("BEACH_SOCCER_FEM_DIRECT_SEMI"),
    ).toBe("LINEAR");
    expect(resolveIsLegacyKnockoutPairingMode("BEACH_SOCCER_FEM_DIRECT_SEMI")).toBe(true);
  });

  it("habilita o cruzamento especial apenas no recorte solicitado", () => {
    expect(
      resolveIsCrossGroupKnockoutPairingAvailable({
        sport_name: "Futebol Society",
        naipe: MatchNaipe.FEMININO,
        division: TeamDivision.DIVISAO_ACESSO,
      }),
    ).toBe(true);

    expect(
      resolveIsCrossGroupKnockoutPairingAvailable({
        sport_name: "Futebol Society",
        naipe: MatchNaipe.MASCULINO,
        division: TeamDivision.DIVISAO_ACESSO,
      }),
    ).toBe(false);
  });
});
