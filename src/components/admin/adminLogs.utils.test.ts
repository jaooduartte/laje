import { describe, expect, it } from "vitest";
import { AdminLogResourceTable } from "@/lib/enums";
import {
  resolveAdminLogDataRecord,
  resolveAdminLogRecordValue,
} from "@/components/admin/adminLogs.utils";

describe("admin log record normalization", () => {
  it("parses historical JSON strings into snapshots", () => {
    expect(resolveAdminLogRecordValue('{"homeScore":0,"awayScore":1}')).toEqual({
      homeScore: 0,
      awayScore: 1,
    });
  });

  it("ignores malformed or non-object snapshots", () => {
    expect(resolveAdminLogRecordValue("not-json")).toBeNull();
    expect(resolveAdminLogRecordValue('"snapshot"')).toBeNull();
  });

  it("normalizes match snapshot keys for field comparisons", () => {
    expect(
      resolveAdminLogDataRecord(AdminLogResourceTable.MATCHES, {
        homeScore: 1,
        homeTeamId: "team-1",
      }),
    ).toEqual({
      home_score: 1,
      home_team_id: "team-1",
    });
  });

  it("preserves keys for non-match snapshots", () => {
    expect(
      resolveAdminLogDataRecord(AdminLogResourceTable.CHAMPIONSHIPS, {
        currentSeasonYear: 2027,
      }),
    ).toEqual({ currentSeasonYear: 2027 });
  });
});
