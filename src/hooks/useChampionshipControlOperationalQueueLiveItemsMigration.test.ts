import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260913184937_keep_live_control_items_visible.sql",
  ),
  "utf8",
);

describe("operational control queue live items migration", () => {
  it("mantém jogos e sessões ao vivo independentemente da data agendada", () => {
    expect(migration).toContain(
      "AND matches_table.status = 'LIVE'\n\n  UNION ALL",
    );
    expect(migration).toContain(
      "AND sessions_table.status = 'LIVE'\n\n  UNION ALL",
    );
  });

  it("continua limitando itens agendados à data atual de São Paulo", () => {
    expect(migration).toContain(
      "AND matches_table.status = 'SCHEDULED'\n      AND matches_table.scheduled_date = timezone('America/Sao_Paulo', now())::DATE",
    );
    expect(migration).toContain(
      "AND sessions_table.status = 'SCHEDULED'\n      AND sessions_table.scheduled_date = timezone('America/Sao_Paulo', now())::DATE",
    );
  });
});
