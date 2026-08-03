import { describe, expect, it } from "vitest";
import {
  resolveCompetitionKnockoutPairingModeValue,
  resolveDefaultCompetitionKnockoutPairingMode,
} from "@/domain/championship-brackets/championshipBracketPairing";

describe("championshipBracketPairing", () => {
  it("usa LINEAR como único modo padrão", () => {
    expect(resolveDefaultCompetitionKnockoutPairingMode()).toBe("LINEAR");
  });

  it("sanitiza valores legados para LINEAR", () => {
    expect(resolveCompetitionKnockoutPairingModeValue("LINEAR")).toBe("LINEAR");
    expect(
      resolveCompetitionKnockoutPairingModeValue("BEACH_SOCCER_FEM_DIRECT_SEMI"),
    ).toBe("LINEAR");
    expect(
      resolveCompetitionKnockoutPairingModeValue("FUTEVOLEI_FEM_INVERTED"),
    ).toBe("LINEAR");
    expect(
      resolveCompetitionKnockoutPairingModeValue(
        "FUTEBOL_SOCIETY_FEM_ACCESS_CROSS_GROUPS",
      ),
    ).toBe("LINEAR");
  });
});
