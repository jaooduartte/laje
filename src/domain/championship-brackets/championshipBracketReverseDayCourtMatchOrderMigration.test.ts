import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260816120000_add_reverse_day_court_match_order_reprogramming.sql"),
  "utf8",
);

describe("reverse day court match order migration", () => {
  it("registra a nova ação de reprogramação e inverte apenas jogos agendados", () => {
    expect(migration).toContain("REVERSE_DAY_COURT_MATCH_ORDER");
    expect(migration).toContain("matches_table.status = 'SCHEDULED'::public.match_status");
    expect(migration).toContain("sequence_length - source_match.sequence_position + 1");
    expect(migration).toContain("source_match.id <> target_match.id");
  });

  it("move o slot completo com uma fase temporária e sem redistribuição automática", () => {
    expect(migration).toContain("start_time = slots_table.target_start_time");
    expect(migration).toContain("end_time = slots_table.target_end_time");
    expect(migration).toContain("queue_position = slots_table.target_queue_position");
    expect(migration).toContain("scheduled_slot = slots_table.target_scheduled_slot");
    expect(migration).toContain("global_queue_order = slots_table.target_global_queue_order");
    expect(migration).toContain("app.skip_queue_trigger");
    expect(migration).not.toContain("redistribute_bracket_scheduled_matches");
  });

  it("bloqueia a operação inteira para agenda, disponibilidade, descanso e representação", () => {
    expect(migration).toContain("A inversão não respeita a agenda configurada");
    expect(migration).toContain("A inversão não respeita a disponibilidade configurada");
    expect(migration).toContain("A inversão não preserva o descanso exigido");
    expect(migration).toContain("A inversão cria conflito de representação");
    expect(migration).toContain("resolve_championship_bracket_team_schedule_windows");
    expect(migration).toContain("CASE WHEN first_match.sport_id = second_match.sport_id THEN 3 ELSE 2 END");
  });

  it("invalida a prévia quando a agenda de jogos mudar", () => {
    expect(migration).toContain("matches_bump_championship_bracket_reprogramming_revision");
    expect(migration).toContain("AFTER UPDATE OF scheduled_date, start_time, end_time, location, court_name, queue_position, global_queue_order, scheduled_slot ON public.matches");
  });
});
