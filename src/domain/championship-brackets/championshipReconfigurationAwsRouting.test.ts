import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repository = readFileSync(
  resolve(process.cwd(), "src/domain/championship-brackets/championshipBracket.repository.ts"),
  "utf8",
);

describe("LAJE-150 championship reconfiguration AWS routing", () => {
  it("sends preview and apply through the authenticated AWS bracket API when selected", () => {
    const preview = repository.slice(
      repository.indexOf("export async function previewChampionshipBracketReconfiguration("),
      repository.indexOf("export async function applyChampionshipBracketReconfiguration("),
    );
    const apply = repository.slice(
      repository.indexOf("export async function applyChampionshipBracketReconfiguration("),
      repository.indexOf("export async function previewManualMatchRelocation("),
    );

    expect(preview).toContain("if (isAwsBackendEnabled())");
    expect(preview).toContain('"reconfiguration-preview"');
    expect(apply).toContain("if (isAwsBackendEnabled())");
    expect(apply).toContain('"reconfiguration-apply"');
    expect(apply).toContain("expectedRevision");
    expect(repository).toContain('"/bracket-operations/" + action');
    expect(preview).toContain('supabase.rpc("preview_championship_bracket_reconfiguration"');
    expect(apply).toContain('supabase.rpc("apply_championship_bracket_reconfiguration"');
  });
});
