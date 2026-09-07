import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260907183000_rotate_manual_relocation_end_without_expansion.sql",
  ),
  "utf8",
);

describe("manual match relocation end rotation migration", () => {
  it("rotates the scheduled queue instead of appending the selected games after it", () => {
    expect(migration).toContain(
      "IF insertion_position IN (''START'', ''END'') OR target_start_time IS NOT NULL THEN",
    );
    expect(migration).toContain(
      "WHERE insertion_position IN (''START'', ''END'') OR is_selected = true OR target_start_time IS NOT NULL",
    );
    expect(migration).toContain("min(old_start_time)");
    expect(migration).toContain("min(old_queue_position) - 1");
    expect(migration).toContain("min(old_scheduled_slot) - 1");
  });

  it("uses the configured sport duration rather than a live-control ending time", () => {
    expect(migration).toContain(
      "matches_table.start_time + make_interval(mins => GREATEST(COALESCE(championship_sports_table.default_match_duration_minutes, 35), 1))",
    );
  });

  it("does not reposition knockout placeholders for an end-of-queue rotation", () => {
    expect(migration).toContain(
      "IF upper(COALESCE(_preview->>'insertion_position', '')) = 'END' THEN",
    );
    expect(migration).toContain("RETURN _preview;");
  });

  it("keeps the planned end time when rotating four selected games after four scheduled games", () => {
    const scheduledGames = [
      { naipe: "FEMININO", startsAt: 0, isSelected: true },
      { naipe: "FEMININO", startsAt: 40, isSelected: true },
      { naipe: "FEMININO", startsAt: 80, isSelected: true },
      { naipe: "FEMININO", startsAt: 120, isSelected: true },
      { naipe: "MASCULINO", startsAt: 160, isSelected: false },
      { naipe: "MASCULINO", startsAt: 200, isSelected: false },
      { naipe: "MASCULINO", startsAt: 240, isSelected: false },
      { naipe: "MASCULINO", startsAt: 280, isSelected: false },
    ];

    const rotatedGames = [
      ...scheduledGames.filter((game) => !game.isSelected),
      ...scheduledGames.filter((game) => game.isSelected),
    ].map((game, index) => ({ ...game, startsAt: index * 40 }));

    expect(rotatedGames.map((game) => game.naipe)).toEqual([
      "MASCULINO",
      "MASCULINO",
      "MASCULINO",
      "MASCULINO",
      "FEMININO",
      "FEMININO",
      "FEMININO",
      "FEMININO",
    ]);
    expect(rotatedGames.at(-1)?.startsAt).toBe(280);
  });
});
