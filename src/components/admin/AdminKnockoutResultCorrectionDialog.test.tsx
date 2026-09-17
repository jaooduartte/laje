import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminKnockoutResultCorrectionDialog } from "@/components/admin/AdminKnockoutResultCorrectionDialog";
import type { KnockoutResultCorrectionPreview } from "@/domain/championship-brackets/knockoutResultCorrection.types";

const basePreview: KnockoutResultCorrectionPreview = {
  requires_reprocessing: true,
  is_knockout_match: true,
  blocked: false,
  block_reason: null,
  requires_replay_schedule: true,
  schedule_preview_generated: true,
  remaining_event_days: 1,
  source: {
    match_id: "qf-match",
    bracket_match_id: "qf-bracket",
    round_number: 1,
    slot_number: 1,
    home_team_id: "raposas",
    home_team_name: "RAPOSAS",
    away_team_id: "abus",
    away_team_name: "ABUS",
    previous_winner_team_id: "raposas",
    previous_winner_team_name: "RAPOSAS",
    corrected_winner_team_id: "abus",
    corrected_winner_team_name: "ABUS",
    walkover_mode: "HOME_LOST",
  },
  replay_match: {
    bracket_match_id: "semi-bracket",
    round_number: 2,
    slot_number: 1,
    current_match_id: "old-semi",
    current_status: "FINISHED",
    home_team_id: "abus",
    home_team_name: "ABUS",
    away_team_id: "aaasf",
    away_team_name: "AAASF",
    duration_minutes: 60,
  },
  final_slot: {
    bracket_match_id: "final-bracket",
    round_number: 3,
    slot_number: 1,
    planned_scheduled_date: "2026-09-19",
    planned_start_time: "12:00:00",
    planned_end_time: "13:30:00",
    planned_location_name: "Campus Park",
    planned_court_name: "Ginásio",
    pending_side: "HOME",
    preserved_team_id: "aaamu",
    preserved_team_name: "AAAMU",
  },
  impacts: [
    {
      bracket_match_id: "semi-bracket",
      match_id: "old-semi",
      depth: 1,
      round_number: 2,
      slot_number: 1,
      status: "FINISHED",
      home_team_id: "raposas",
      home_team_name: "RAPOSAS",
      away_team_id: "aaasf",
      away_team_name: "AAASF",
      action: "REPLAY",
    },
  ],
  schedule_candidates: [
    {
      id: "2026-09-19|court|09:00",
      scheduled_date: "2026-09-19",
      bracket_court_id: "court",
      location_group_id: "location-group",
      court_group_id: "court-group",
      location_name: "Campus Park",
      court_name: "Quadra",
      start_time: "09:00",
      end_time: "10:00",
      duration_minutes: 60,
      planned_scheduled_slot: 1,
      planned_queue_position: 1,
    },
  ],
};

describe("AdminKnockoutResultCorrectionDialog", () => {
  it("shows the preserved finalist and requires a replay slot before applying", () => {
    const onApply = vi.fn();

    render(
      <AdminKnockoutResultCorrectionDialog
        open
        preview={basePreview}
        isGeneratingSchedule={false}
        isApplying={false}
        onOpenChange={vi.fn()}
        onGenerateSchedule={vi.fn()}
        onApply={onApply}
      />,
    );

    expect(screen.getByText("A definir x AAAMU")).toBeInTheDocument();
    expect(screen.getByText("ABUS x AAASF")).toBeInTheDocument();

    const confirmButton = screen.getByRole("button", {
      name: "Confirmar e reprocessar chaveamento",
    });
    expect(confirmButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/19\/09\/2026 · 09:00–10:00/));
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleCandidateId: "2026-09-19|court|09:00",
      }),
    );
  });
});
