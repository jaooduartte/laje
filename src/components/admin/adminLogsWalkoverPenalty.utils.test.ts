import { describe, expect, it } from "vitest";
import { resolveWalkoverPenaltyCountChanges } from "@/components/admin/adminLogsWalkoverPenalty.utils";

describe("resolveWalkoverPenaltyCountChanges", () => {
  it("identifies each athletic whose W.O. count changed", () => {
    expect(
      resolveWalkoverPenaltyCountChanges(
        [
          { team_id: "team-a", walkover_count: 1 },
          { team_id: "team-b", walkover_count: 2 },
        ],
        [
          { team_id: "team-a", walkover_count: 3 },
          { team_id: "team-c", walkover_count: 1 },
        ],
        {
          "team-a": "Atlética A",
          "team-b": "Atlética B",
          "team-c": "Atlética C",
        },
      ),
    ).toEqual([
      "Atlética A: 1 para 3 W.O.",
      "Atlética B: 2 para 0 W.O.",
      "Atlética C: 0 para 1 W.O.",
    ]);
  });

  it("returns null when the audit data is not a W.O. count list", () => {
    expect(
      resolveWalkoverPenaltyCountChanges(
        [{ team_id: "team-a", walkover_count: 1 }],
        "invalid",
        {},
      ),
    ).toBeNull();
  });
});
