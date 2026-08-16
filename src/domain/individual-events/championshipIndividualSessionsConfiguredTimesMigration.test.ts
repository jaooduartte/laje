import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260815030000_sync_individual_sessions_with_configured_times.sql",
  ),
  "utf8",
);

describe("championship individual sessions configured times migration", () => {
  it("sincroniza os horários configurados e considera a sessão agendada", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS start_time TIME NULL");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS end_time TIME NULL");
    expect(migration).toContain("session_record.value->>'start_time'");
    expect(migration).toContain("session_record.value->>'end_time'");
    expect(migration).toContain("valid_sessions.start_time IS NOT NULL");
    expect(migration).toContain("valid_sessions.end_time IS NOT NULL");
  });

  it("preserva a compatibilidade com sessões legadas por período", () => {
    expect(migration).toContain("valid_sessions.period IS NOT NULL");
    expect(migration).toContain("EXCLUDED.period IS NOT NULL");
  });

  it("reconcilia as sessões existentes e permite voltar para agendada", () => {
    expect(migration).toContain(
      "sync_championship_individual_sessions_from_setup",
    );
    expect(migration).toContain(
      "return_championship_individual_session_to_scheduled",
    );
    expect(migration).toContain("current_session.start_time IS NULL");
    expect(migration).toContain("current_session.end_time IS NULL");
  });

  it("permite sincronizar rascunhos e agendamentos durante a revisão", () => {
    expect(migration).toContain(
      "prevent_review_individual_session_operations",
    );
    expect(migration).toContain(
      "'DRAFT'::public.championship_individual_session_status",
    );
    expect(migration).toContain(
      "'SCHEDULED'::public.championship_individual_session_status",
    );
  });
});
