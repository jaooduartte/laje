from pathlib import Path

path = Path("src/components/admin/AdminMatches.tsx")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one occurrence, found {count}: {old[:120]!r}")
    text = text.replace(old, new, 1)


replace_once(
    'import { AdminMatchesViewMode } from "@/components/admin/adminMatches.types";\n',
    'import { AdminMatchesViewMode } from "@/components/admin/adminMatches.types";\n'
    'import { AdminKnockoutResultCorrectionDialog } from "@/components/admin/AdminKnockoutResultCorrectionDialog";\n'
    'import {\n'
    '  applyKnockoutResultCorrection,\n'
    '  previewKnockoutResultCorrection,\n'
    '  resolveKnockoutResultCorrectionRpcErrorMessage,\n'
    '} from "@/domain/championship-brackets/knockoutResultCorrection.repository";\n'
    'import type {\n'
    '  KnockoutResultCorrectionPreview,\n'
    '  KnockoutResultCorrectionWalkoverMode,\n'
    '} from "@/domain/championship-brackets/knockoutResultCorrection.types";\n',
)

replace_once(
    '  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);\n'
    '  const [editingMatchDraft, setEditingMatchDraft] =\n'
    '    useState<MatchEditDraft | null>(null);\n'
    '  const [matchesSportFilter, setMatchesSportFilter] = useState<string>(\n',
    '  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);\n'
    '  const [editingMatchDraft, setEditingMatchDraft] =\n'
    '    useState<MatchEditDraft | null>(null);\n'
    '  const [pendingKnockoutCorrection, setPendingKnockoutCorrection] = useState<{\n'
    '    matchId: string;\n'
    '    walkoverMode: KnockoutResultCorrectionWalkoverMode;\n'
    '    preview: KnockoutResultCorrectionPreview;\n'
    '  } | null>(null);\n'
    '  const [isGeneratingKnockoutCorrectionSchedule, setIsGeneratingKnockoutCorrectionSchedule] =\n'
    '    useState(false);\n'
    '  const [isApplyingKnockoutCorrection, setIsApplyingKnockoutCorrection] =\n'
    '    useState(false);\n'
    '  const [matchesSportFilter, setMatchesSportFilter] = useState<string>(\n',
)

replace_once(
    '  const handleSaveEditingMatch = async (\n'
    '    scoreSheetReviewSaveDecision?: ScoreSheetReviewSaveDecision,\n'
    '  ) => {\n',
    '  const handleGenerateKnockoutCorrectionSchedule = async () => {\n'
    '    if (!pendingKnockoutCorrection) {\n'
    '      return;\n'
    '    }\n\n'
    '    setIsGeneratingKnockoutCorrectionSchedule(true);\n\n'
    '    const { data, error } = await previewKnockoutResultCorrection(\n'
    '      pendingKnockoutCorrection.matchId,\n'
    '      pendingKnockoutCorrection.walkoverMode,\n'
    '      true,\n'
    '    );\n\n'
    '    setIsGeneratingKnockoutCorrectionSchedule(false);\n\n'
    '    if (error) {\n'
    '      toast.error(resolveKnockoutResultCorrectionRpcErrorMessage(error));\n'
    '      return;\n'
    '    }\n\n'
    '    if (!data) {\n'
    '      toast.error("Não foi possível gerar a prévia de horários do mata-mata.");\n'
    '      return;\n'
    '    }\n\n'
    '    setPendingKnockoutCorrection((current) =>\n'
    '      current ? { ...current, preview: data } : current,\n'
    '    );\n'
    '  };\n\n'
    '  const handleApplyKnockoutCorrection = async ({\n'
    '    scheduleCandidateId,\n'
    '    reason,\n'
    '  }: {\n'
    '    scheduleCandidateId: string | null;\n'
    '    reason: string;\n'
    '  }) => {\n'
    '    if (!pendingKnockoutCorrection) {\n'
    '      return;\n'
    '    }\n\n'
    '    setIsApplyingKnockoutCorrection(true);\n\n'
    '    const { error } = await applyKnockoutResultCorrection({\n'
    '      matchId: pendingKnockoutCorrection.matchId,\n'
    '      walkoverMode: pendingKnockoutCorrection.walkoverMode,\n'
    '      scheduleCandidateId,\n'
    '      reason,\n'
    '    });\n\n'
    '    if (error) {\n'
    '      setIsApplyingKnockoutCorrection(false);\n'
    '      toast.error(resolveKnockoutResultCorrectionRpcErrorMessage(error));\n'
    '      return;\n'
    '    }\n\n'
    '    setPendingKnockoutCorrection(null);\n'
    '    handleCancelEditingMatch();\n'
    '    toast.success("W.O. aplicado e chaveamento reprocessado.");\n'
    '    await Promise.all([onRefetch(), onRefetchChampionshipBracket()]);\n'
    '    setIsApplyingKnockoutCorrection(false);\n'
    '  };\n\n'
    '  const handleSaveEditingMatch = async (\n'
    '    scoreSheetReviewSaveDecision?: ScoreSheetReviewSaveDecision,\n'
    '  ) => {\n',
)

replace_once(
    '    if (scoreSheetReviewSaveDecision != null) {\n'
    '      setShowEditReviewConfirmationDialog(false);\n'
    '    }\n\n'
    '    setSavingEditingMatch(true);\n\n'
    '    if (didChangeWalkoverMode) {\n',
    '    if (scoreSheetReviewSaveDecision != null) {\n'
    '      setShowEditReviewConfirmationDialog(false);\n'
    '    }\n\n'
    '    const shouldPreviewKnockoutCorrection =\n'
    '      didChangeWalkoverMode &&\n'
    '      isEditingKnockoutMatch &&\n'
    '      (editingMatchDraft.walkoverMode == "HOME_LOST" ||\n'
    '        editingMatchDraft.walkoverMode == "AWAY_LOST");\n\n'
    '    if (shouldPreviewKnockoutCorrection) {\n'
    '      setSavingEditingMatch(true);\n'
    '      const correctionWalkoverMode =\n'
    '        editingMatchDraft.walkoverMode as KnockoutResultCorrectionWalkoverMode;\n'
    '      const { data: correctionPreview, error: correctionPreviewError } =\n'
    '        await previewKnockoutResultCorrection(\n'
    '          editingMatchId,\n'
    '          correctionWalkoverMode,\n'
    '          false,\n'
    '        );\n'
    '      setSavingEditingMatch(false);\n\n'
    '      if (correctionPreviewError) {\n'
    '        toast.error(\n'
    '          resolveKnockoutResultCorrectionRpcErrorMessage(\n'
    '            correctionPreviewError,\n'
    '          ),\n'
    '        );\n'
    '        return;\n'
    '      }\n\n'
    '      if (correctionPreview?.requires_reprocessing) {\n'
    '        setPendingKnockoutCorrection({\n'
    '          matchId: editingMatchId,\n'
    '          walkoverMode: correctionWalkoverMode,\n'
    '          preview: correctionPreview,\n'
    '        });\n'
    '        return;\n'
    '      }\n'
    '    }\n\n'
    '    setSavingEditingMatch(true);\n\n'
    '    if (didChangeWalkoverMode) {\n',
)

replace_once(
    '      <Dialog\n'
    '        open={showEditReviewConfirmationDialog}\n'
    '        onOpenChange={setShowEditReviewConfirmationDialog}\n'
    '      >\n',
    '      <AdminKnockoutResultCorrectionDialog\n'
    '        open={pendingKnockoutCorrection != null}\n'
    '        preview={pendingKnockoutCorrection?.preview ?? null}\n'
    '        isGeneratingSchedule={isGeneratingKnockoutCorrectionSchedule}\n'
    '        isApplying={isApplyingKnockoutCorrection}\n'
    '        onOpenChange={(open) => {\n'
    '          if (!open) {\n'
    '            setPendingKnockoutCorrection(null);\n'
    '          }\n'
    '        }}\n'
    '        onGenerateSchedule={handleGenerateKnockoutCorrectionSchedule}\n'
    '        onApply={handleApplyKnockoutCorrection}\n'
    '      />\n\n'
    '      <Dialog\n'
    '        open={showEditReviewConfirmationDialog}\n'
    '        onOpenChange={setShowEditReviewConfirmationDialog}\n'
    '      >\n',
)

path.write_text(text, encoding="utf-8")
print("AdminMatches.tsx patched successfully")
