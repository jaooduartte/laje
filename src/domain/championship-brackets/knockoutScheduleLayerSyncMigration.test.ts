import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260918124500_keep_knockout_schedule_layers_in_sync.sql",
  ),
  "utf8",
);

describe("knockout schedule layer synchronization migration", () => {
  it("sincroniza scheduled_start_time após realocação manual", () => {
    expect(migration).toContain(
      "SET scheduled_start_time = changes_table.start_time",
    );
    expect(migration).toContain(
      "bracket_matches_table.match_id = changes_json.match_id",
    );
    expect(migration).toContain(
      "championship_bracket_knockout_schedule_reservations",
    );
  });

  it("sincroniza horário visual e reservas após troca de mata-mata", () => {
    expect(migration).toContain(
      "SET scheduled_start_time = matches_table.start_time",
    );
    expect(migration).toContain(
      "swap_knockout_schedule_slots_base_schedule_sync",
    );
    expect(migration).toContain(
      "reservations_table.competition_id = bracket_matches_table.competition_id",
    );
  });

  it("não contém reparo hardcoded de partidas específicas", () => {
    expect(migration).not.toContain(
      "f53c13e8-77c3-4354-b90f-d1274758b11e",
    );
    expect(migration).not.toContain(
      "57fcadf8-74c3-4bed-80e8-f4ff59c4b97a",
    );
  });
});
