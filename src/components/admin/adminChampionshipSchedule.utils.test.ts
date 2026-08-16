import { describe, expect, it } from "vitest";
import {
  groupReverseMatchOrderChangesByCourt,
  resolveReverseMatchOrderCourtPosition,
  resolveReverseMatchOrderCourtIds,
} from "@/components/admin/adminChampionshipSchedule.utils";

describe("resolveReverseMatchOrderCourtIds", () => {
  it("seleciona todas as quadras da data escolhida", () => {
    expect(resolveReverseMatchOrderCourtIds([
      { event_date: "2026-08-29", courts: [{ id: "court-1" }] },
      { event_date: "2026-08-30", courts: [{ id: "court-2" }, { id: "court-3" }] },
    ], "2026-08-30")).toEqual(["court-2", "court-3"]);
  });

  it("não seleciona quadras quando a data não está configurada", () => {
    expect(resolveReverseMatchOrderCourtIds([], "2026-08-30")).toEqual([]);
  });

  it("agrupa a prévia por quadra e mantém os jogos na ordem atual", () => {
    const groups = groupReverseMatchOrderChangesByCourt([
      {
        match_id: "court-a-last",
        before: { location: "Campus Park", court_name: "Quadra", scheduled_slot: 18, start_time: "2026-08-30T14:00:00Z" },
        after: { location: "Campus Park", court_name: "Quadra", scheduled_slot: 1 },
      },
      {
        match_id: "court-b-first",
        before: { location: "Campus Park", court_name: "Ginásio", scheduled_slot: 1, start_time: "2026-08-30T07:30:00Z" },
        after: { location: "Campus Park", court_name: "Ginásio", scheduled_slot: 18 },
      },
      {
        match_id: "court-a-first",
        before: { location: "Campus Park", court_name: "Quadra", scheduled_slot: 1, start_time: "2026-08-30T07:30:00Z" },
        after: { location: "Campus Park", court_name: "Quadra", scheduled_slot: 18 },
      },
    ]);

    expect(groups.map((group) => group.label)).toEqual(["Campus Park • Ginásio", "Campus Park • Quadra"]);
    expect(groups[1].changes.map((change) => change.match_id)).toEqual(["court-a-first", "court-a-last"]);
  });

  it("prioriza a posição sequencial da quadra na prévia", () => {
    expect(resolveReverseMatchOrderCourtPosition({ court_sequence_position: 3, scheduled_slot: 5 }, 1)).toBe(3);
    expect(resolveReverseMatchOrderCourtPosition({ scheduled_slot: 5 }, 2)).toBe(2);
  });

  it("ordena cada quadra pela sequência de jogos, não pelo slot global", () => {
    const [group] = groupReverseMatchOrderChangesByCourt([
      {
        match_id: "third-game",
        before: { location: "Campus Park", court_name: "Ginásio", scheduled_slot: 5, court_sequence_position: 3 },
        after: {},
      },
      {
        match_id: "first-game",
        before: { location: "Campus Park", court_name: "Ginásio", scheduled_slot: 8, court_sequence_position: 1 },
        after: {},
      },
    ]);

    expect(group.changes.map((change) => change.match_id)).toEqual(["first-game", "third-game"]);
  });
});
