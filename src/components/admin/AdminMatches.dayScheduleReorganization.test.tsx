import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  resolve(process.cwd(), "src/components/admin/AdminMatches.tsx"),
  "utf8",
);

describe("AdminMatches day schedule reorganization", () => {
  it("offers the operation from pending manual relocations", () => {
    expect(componentSource).toContain("Realocar jogos selecionados");
    expect(componentSource).toContain("selectedPendingMatchesForDayScheduleReorganization");
    expect(componentSource).toContain("handleOpenDayScheduleReorganizationDialog");
  });

  it("groups pending relocation cards by sport and naipe", () => {
    expect(componentSource).toContain("pendingManualRelocationMatchGroups");
    expect(componentSource).toContain("groupsBySportAndNaipe");
    expect(componentSource).toContain("group.matches.length");
    expect(componentSource).toContain("MATCH_NAIPE_LABELS[group.naipe]");
    expect(componentSource).toContain("handleToggleSelectedPendingManualRelocationMatchGroup");
    expect(componentSource).toContain('"indeterminate"');
  });

  it("mounts one drag-and-drop timeline instead of choosing a strategy", () => {
    expect(componentSource).toContain("previewDayScheduleReorganization");
    expect(componentSource).toContain('buildDayScheduleReorganizationInput([], {})');
    expect(componentSource).toContain("Montar cronograma");
    expect(componentSource).not.toContain("Posição de encaixe");
    expect(componentSource).not.toContain("Selecionar jogos para encaixar");
    expect(componentSource).toContain("dayScheduleReorganizationTimelineCourtColumns");
    expect(componentSource).toContain("Sequência cronológica da quadra");
  });

  it("shows the selected pending matches and planned knockout slots in the template", () => {
    expect(componentSource).toContain("Jogos que serão encaixados");
    expect(componentSource).toContain("dayScheduleReorganizationPlaceholdersById");
    expect(componentSource).toContain("A definir x A definir");
    expect(componentSource).toContain("placeholder.stage_label");
    expect(componentSource).toContain("placeholder.display_match_number");
    expect(componentSource).toContain("MATCH_NAIPE_LABELS[naipe]");
    expect(componentSource).toContain("Jogos a encaixar");
    expect(componentSource).toContain("placedDayScheduleReorganizationMatchIds");
    expect(componentSource).toContain("handlePlaceDayScheduleReorganizationPendingMatch");
    expect(componentSource).toContain("Soltar após este item");
  });

  it("uses the optional time only to anticipate the day start", () => {
    expect(componentSource).toContain("Novo horário de início do dia");
    expect(componentSource).toContain("day_start_time");
    expect(componentSource).toContain("não define o horário do jogo selecionado");
    expect(componentSource).toContain("Ajuda sobre novo horário de início do dia");
    expect(componentSource).toContain("Ajuda sobre intervalo da programação");
    expect(componentSource).toContain("<TooltipContent className=\"max-w-xs text-xs leading-relaxed\">");
    expect(componentSource).toContain("[&::-webkit-calendar-picker-indicator]:hidden");
  });

  it("keeps the day inputs on one row and removes the unused observation", () => {
    expect(componentSource).toContain('className="grid gap-3 md:grid-cols-3"');
    expect(componentSource).toContain("Intervalo da programação");
    expect(componentSource).not.toContain("day-schedule-reorganization-notes");
    expect(componentSource).not.toContain("dayScheduleReorganizationNotes");
  });

  it("lets the CO preserve or remove the configured general or target-court interval", () => {
    expect(componentSource).toContain("KEEP_BEFORE_KNOCKOUT");
    expect(componentSource).toContain("Manter antes do mata-mata");
    expect(componentSource).toContain("Manter na sequência da quadra");
    expect(componentSource).toContain("acompanha os jogos encaixados antes dele");
    expect(componentSource).toContain("Remover intervalo");
    expect(componentSource).toContain("Intervalo: removido na confirmação");
    expect(componentSource).toContain("sua janela ficará disponível");
    expect(componentSource).toContain("dayScheduleReorganizationManagedBreak");
    expect(componentSource).toContain("dayScheduleReorganizationRemovableResourceLock");
    expect(componentSource).toContain("removable_resource_lock");
    expect(componentSource).toContain("dayScheduleReorganizationTargetCourtBreaks");
    expect(componentSource).toContain("Intervalo da quadra-base");
  });

  it("shows the target court interval in the preview timeline", () => {
    expect(componentSource).toContain('item_type: "BREAK"');
    expect(componentSource).toContain("Intervalo da quadra");
    expect(componentSource).toContain("Reposicionado");
    expect(componentSource).toContain('breakItem.scope_type == "ALL_COURTS"');
    expect(componentSource).toContain("is_fixed: true");
  });

  it("drags pending cards to the base court and reorders movable timeline cards", () => {
    expect(componentSource).toContain("handleReorderDayScheduleReorganizationManualItem");
    expect(componentSource).toContain('type: "PENDING"');
    expect(componentSource).toContain('type: "TIMELINE"');
    expect(componentSource).toContain("manual_court_item_order");
    expect(componentSource).toContain(
      "draggable={canReorderManualItem && !loadingDayScheduleReorganizationPreview}",
    );
    expect(componentSource).toContain("onDrop={(event)");
    expect(componentSource).toContain("restConflicts.length > 0");
    expect(componentSource).toContain("restConflicts.join");
    expect(componentSource).toContain("border-2 border-destructive/90 bg-destructive/20");
    expect(componentSource).toContain(
      "canPlacePendingMatch || canReorderManualItem",
    );
    expect(componentSource).toContain(
      "A prévia mantém as demais quadras até que você reordene",
    );
  });

  it("keeps the tray as the only selected-match summary after mounting and scrolls while dragging", () => {
    expect(componentSource).toContain("{!dayScheduleReorganizationPreview ? (");
    expect(componentSource).toContain("handleDayScheduleReorganizationDialogDragOver");
    expect(componentSource).toContain("dialogContent.scrollBy");
    expect(componentSource).toContain('className="space-y-2"');
  });

  it("keeps a pending card in the tray when the recalculated timeline does not include it", () => {
    expect(componentSource).toContain("item.match_id == draggedItem.itemId && item.is_relocated");
    expect(componentSource).toContain(
      "O jogo não foi incluído no cronograma calculado e permaneceu na bandeja.",
    );
    expect(componentSource).toContain("draggable={!loadingDayScheduleReorganizationPreview}");
  });

  it("removes the input-like drag instruction from the schedule header", () => {
    expect(componentSource).not.toContain(
      'className="app-input-field flex min-h-10 items-center px-3 text-sm"',
    );
  });

  it("only enables confirmation after every selected game is placed without blockers", () => {
    expect(componentSource).toContain("placedDayScheduleReorganizationMatchIds.length !=");
    expect(componentSource).toContain("dayScheduleReorganizationHasRestConflicts");
    expect(componentSource).toContain("preview.blockers.length > 0");
    expect(componentSource).toContain("applyDayScheduleReorganization");
  });
});
