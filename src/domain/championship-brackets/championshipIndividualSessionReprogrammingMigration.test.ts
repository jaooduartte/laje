import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819052946_add_individual_session_reprogramming.sql",
  ),
  "utf8",
);

describe("individual session reprogramming migration", () => {
  it("registers individual session reprogramming in the safe reconfiguration flow", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.reprogram_championship_individual_session",
    );

    expect(migration).toContain(
      "WHEN 'INDIVIDUAL_SESSION' THEN",
    );

    expect(migration).toContain(
      "public.reprogram_championship_individual_session",
    );
  });

  it("keeps the individual session and setup snapshot synchronized", () => {
    expect(migration).toContain(
      "UPDATE public.championship_individual_sessions",
    );

    expect(migration).toContain(
      "UPDATE public.championship_individual_events",
    );

    expect(migration).toContain(
      "'{individual_session_configs}'",
    );

    expect(migration).toContain(
      "'{resource_locks}'",
    );

    expect(migration).toContain(
      "next_individual_session_configs",
    );

    expect(migration).toContain(
      "next_resource_locks",
    );
  });

  it("allows the exact shared slot between different naipes of the same sport and division", () => {
    expect(migration).toContain(
      "other_session.sport_id = session_record.sport_id",
    );

    expect(migration).toContain(
      "other_session.division IS NOT DISTINCT FROM session_record.division",
    );

    expect(migration).toContain(
      "other_session.naipe <> session_record.naipe",
    );

    expect(migration).toContain(
      "other_session.start_time = start_time_value",
    );

    expect(migration).toContain(
      "other_session.end_time = end_time_value",
    );
  });

  it("does not treat derived individual-session locks as independent manual locks", () => {
    expect(migration).toContain(
      "individual_session_keys AS",
    );

    expect(migration).toContain(
      "preserved_resource_locks AS",
    );

    expect(migration).toContain(
      "derived_session_lock_candidates AS",
    );

    expect(migration).toContain(
      "derived_session_locks AS",
    );
  });

  it("rejects an individual session reprogramming with no effective changes", () => {
    expect(migration).toContain(
      "Nenhuma alteração foi informada para esta sessão.",
    );

    expect(migration).toContain(
      "session_record.scheduled_date",
    );

    expect(migration).toContain(
      "session_record.exclusive_lock_enabled",
    );
  });

  it("protects fixed schedule conflicts", () => {
    expect(migration).toContain(
      "A sessão conflita com outra sessão individual no mesmo recurso.",
    );

    expect(migration).toContain(
      "A sessão conflita com uma reserva fixa deste recurso.",
    );

    expect(migration).toContain(
      "O horário da sessão conflita com um intervalo configurado.",
    );

    expect(migration).toContain(
      "A reserva exclusiva da sessão conflita com um jogo já programado.",
    );
  });
});