import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260908191441_add_rich_announcement_content.sql",
  ),
  "utf8",
);

describe("rich announcement content migration", () => {
  it("stores the structured content and the selected announcement type", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS announcement_content JSONB");
    expect(migration).toContain("announcement_type IN ('IMPROVEMENT', 'NOTICE', 'PROBLEM')");
    expect(migration).toContain("_announcement_content JSONB DEFAULT NULL");
    expect(migration).toContain("_announcement_type TEXT DEFAULT NULL");
    expect(migration).toContain("current_settings_row.announcement_type,");
    expect(migration).toContain("'NOTICE'");
    expect(migration).toContain("announcement_content JSONB,");
    expect(migration).toContain("announcement_type TEXT,");
  });

  it("only accepts the supported structured rich-text format", () => {
    expect(migration).toContain("_announcement_content ->> 'version' <> '1'");
    expect(migration).toContain("jsonb_typeof(_announcement_content -> 'version') <> 'number'");
    expect(migration).toContain("jsonb_typeof(segments.segment -> 'bold') <> 'boolean'");
    expect(migration).toContain("jsonb_typeof(segments.segment -> 'italic') <> 'boolean'");
    expect(migration).toContain("jsonb_typeof(segments.segment -> 'underline') <> 'boolean'");
  });
});
