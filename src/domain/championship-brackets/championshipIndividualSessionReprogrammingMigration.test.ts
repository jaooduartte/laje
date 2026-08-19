import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const baseMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819052946_add_individual_session_reprogramming.sql",
  ),
  "utf8",
);

const safeguardsMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260819191747_fix_individual_session_reprogramming_safeguards.sql",
  ),
  "utf8",
);

describe("individual session reprogramming migrations", () => {
  it("registers individual session reprogramming in the safe reconfiguration flow", () => {
    expect(baseMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.reprogram_championship_individual_session",
    );

    expect(baseMigration).toContain(
      "WHEN 'INDIVIDUAL_SESSION' THEN",
    );

    expect(baseMigration).toContain(
      "public.reprogram_championship_individual_session",
    );
  });

  it("keeps the individual session and setup snapshot synchronized", () => {
    expect(safeguardsMigration).toContain(
      "UPDATE public.championship_individual_sessions",
    );

    expect(safeguardsMigration).toContain(
      "UPDATE public.championship_individual_events",
    );

    expect(safeguardsMigration).toContain(
      "'{individual_session_configs}'",
    );

    expect(safeguardsMigration).toContain(
      "'{resource_locks}'",
    );

    expect(safeguardsMigration).toContain(
      "next_individual_session_configs",
    );

    expect(safeguardsMigration).toContain(
      "next_resource_locks",
    );
  });

  it("allows the exact shared slot between different naipes of the same sport and division", () => {
    expect(safeguardsMigration).toContain(
      "other_session.sport_id = session_record.sport_id",
    );

    expect(safeguardsMigration).toContain(
      "other_session.division IS NOT DISTINCT FROM session_record.division",
    );

    expect(safeguardsMigration).toContain(
      "other_session.naipe <> session_record.naipe",
    );

    expect(safeguardsMigration).toContain(
      "other_session.start_time = start_time_value",
    );

    expect(safeguardsMigration).toContain(
      "other_session.end_time = end_time_value",
    );
  });

  it("does not treat derived individual-session locks as independent manual locks", () => {
    expect(safeguardsMigration).toContain(
      "individual_session_keys AS",
    );

    expect(safeguardsMigration).toContain(
      "preserved_resource_locks AS",
    );

    expect(safeguardsMigration).toContain(
      "derived_session_lock_candidates AS",
    );

    expect(safeguardsMigration).toContain(
      "derived_session_locks AS",
    );
  });

  it("rejects an individual session reprogramming with no effective changes", () => {
    expect(safeguardsMigration).toContain(
      "Nenhuma alteração foi informada para esta sessão.",
    );

    expect(safeguardsMigration).toContain(
      "session_record.scheduled_date",
    );

    expect(safeguardsMigration).toContain(
      "session_record.exclusive_lock_enabled",
    );
  });

  it("protects fixed schedule conflicts", () => {
    expect(safeguardsMigration).toContain(
      "A sessão conflita com outra sessão individual no mesmo recurso.",
    );

    expect(safeguardsMigration).toContain(
      "A sessão conflita com uma reserva fixa deste recurso.",
    );

    expect(safeguardsMigration).toContain(
      "O horário da sessão conflita com um intervalo configurado.",
    );

    expect(safeguardsMigration).toContain(
      "A reserva exclusiva da sessão conflita com um jogo já programado.",
    );
  });
});