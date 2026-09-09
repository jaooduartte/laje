import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  resolve(
    process.cwd(),
    "src/components/championship-brackets/ChampionshipBracketBoard.tsx",
  ),
  "utf8",
);

describe("ChampionshipBracketBoard", () => {
  it("does not render an unnecessary naipe filter in the public knockout board", () => {
    expect(componentSource).not.toContain("Todos os naipes");
    expect(componentSource).not.toContain('placeholder="Filtrar naipe"');
    expect(componentSource).not.toContain("naipeFilter");
    expect(componentSource).not.toContain("availableNaipeOptions");
  });

  it("keeps the division filter when the championship uses divisions", () => {
    expect(componentSource).toContain("Todas as divisões");
    expect(componentSource).toContain("availableDivisions.length > 0");
  });

  it("keeps the match number visible outside scheduled knockout cards", () => {
    expect(componentSource).toContain(
      "projectedMatch.display_match_number ?? projectedMatch.queue_position",
    );
    expect(componentSource).toContain(
      "`A definir em fila • ${matchNumberLabel}`",
    );
    expect(componentSource).toContain(
      "`${scheduleLabel} • ${matchNumberLabel}`",
    );
  });

  it("shows the estimated time in scheduled knockout cards", () => {
    expect(componentSource).toContain('"HH:mm"');
    expect(componentSource).toContain("estimatedTimeLabel");
    expect(componentSource).toContain("`${scheduledDateLabel}${estimatedTimeLabel");
  });

  it("uses the persisted round and slot to place knockout cards, independently from schedule order", () => {
    expect(componentSource).toContain("knockoutMatchByRoundAndSlot.set(");
    expect(componentSource).toContain(
      "`${knockoutMatch.round_number}:${knockoutMatch.slot_number}:${knockoutMatch.is_third_place}`",
    );
    expect(componentSource).toContain("currentRound.matches");
    expect(componentSource).toContain(".slice(0, sideMatchCount)");
    expect(componentSource).toContain(".slice(sideMatchCount)");
  });
});
