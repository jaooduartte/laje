import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260912213008_correct_season_sport_removal_preview_participants.sql",
  ),
  "utf8",
);

describe("season sport removal preview participants correction migration", () => {
  it("counts participating teams from the persisted setup payload", () => {
    expect(migration).toContain("configured_teams_count");
    expect(migration).toContain("payload_snapshot->'participants'");
    expect(migration).toContain("count(DISTINCT participant_record.value->>'team_id')");
  });

  it("removes only the selected sport configuration when the seasonal removal is recorded", () => {
    expect(migration).toContain("sync_championship_season_sport_removal_payload");
    expect(migration).toContain("'{enabled_sport_ids}'");
    expect(migration).toContain("'{individual_event_configs}'");
    expect(migration).toContain("'{individual_session_configs}'");
    expect(migration).toContain("'{participants}'");
    expect(migration).toContain("NEW.sport_id");
  });
});
