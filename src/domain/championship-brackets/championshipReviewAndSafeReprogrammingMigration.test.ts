import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const enumMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260814234959_add_championship_review_and_safe_reprogramming.sql"),
  "utf8",
);
const workflowMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260814235554_implement_championship_review_and_safe_reprogramming.sql"),
  "utf8",
);

describe("championship review and safe reprogramming migrations", () => {
  it("adds review before using it in the workflow migration", () => {
    expect(enumMigration).toContain("ADD VALUE IF NOT EXISTS 'REVIEW' AFTER 'UPCOMING'");
    expect(workflowMigration).toContain("status = 'REVIEW'::public.championship_status");
  });

  it("moves generated championships to review and protects operational actions", () => {
    expect(workflowMigration).toContain("SET status = 'REVIEW'::public.championship_status");
    expect(workflowMigration).toContain("prevent_review_match_operations");
    expect(workflowMigration).toContain("prevent_review_individual_session_operations");
  });

  it("requires preview revision before applying a reprogramming", () => {
    expect(workflowMigration).toContain("preview_championship_bracket_reconfiguration");
    expect(workflowMigration).toContain("apply_championship_bracket_reconfiguration");
    expect(workflowMigration).toContain("revision_value <> _expected_revision");
    expect(workflowMigration).toContain("ROLLBACK_CHAMPIONSHIP_BRACKET_RECONFIGURATION_PREVIEW");
  });
});
