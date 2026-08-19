import {
  resolveBracketPairingByMode,
  resolveChampionshipBracketKnockoutProjection,
  resolveChampionshipBracketSeedPlaceholderLabels,
} from "@/domain/championship-brackets/championshipBracketKnockoutProjection";
import type { ChampionshipKnockoutPairingMode } from "@/domain/championship-brackets/championshipBracketPairing";
import {
  resolveCompetitionConfigByQualificationMode,
  type QualificationModeOption,
} from "@/domain/championship-brackets/championshipBracketQualification";
import type { ChampionshipBracketCompetition } from "@/lib/types";

interface Props {
  competition: ChampionshipBracketCompetition;
  qualificationMode: QualificationModeOption;
  pairingMode: ChampionshipKnockoutPairingMode;
}

interface PreviewMatch {
  home: string;
  away: string;
}

function resolvePreviewMatchLabel(match: PreviewMatch): string {
  const homeIsBye = match.home == "BYE";
  const awayIsBye = match.away == "BYE";

  if (homeIsBye && awayIsBye) {
    return "A definir";
  }

  if (homeIsBye) {
    return match.away;
  }

  if (awayIsBye) {
    return match.home;
  }

  return `${match.home} × ${match.away}`;
}

function MatchMiniCard({
  match,
  align = "left",
}: {
  match: PreviewMatch;
  align?: "left" | "right";
}) {
  const label = resolvePreviewMatchLabel(match);

  return (
    <div
      className={`flex h-9 min-w-0 items-center justify-center rounded-md border border-border/60 bg-background/70 px-2 text-[9px] font-medium leading-[1.15] ${
        align == "right" ? "justify-center" : ""
      }`}
      title={label}
    >
      <span className="line-clamp-2">
        {label}
      </span>
    </div>
  );
}

function TwoMatchSide({
  matches,
  side,
  stageLabel,
}: {
  matches: PreviewMatch[];
  side: "left" | "right";
  stageLabel: string;
}) {
  const firstMatch = matches[0];
  const secondMatch = matches[1];

  if (!firstMatch || !secondMatch) {
    return null;
  }

  const matchCards = (
    <div className="min-w-0 space-y-2">
      <MatchMiniCard
        match={firstMatch}
        align={side == "right" ? "right" : "left"}
      />

      <MatchMiniCard
        match={secondMatch}
        align={side == "right" ? "right" : "left"}
      />
    </div>
  );

  const connector =
    side == "left" ? (
      <div
        className="relative h-20 w-5 shrink-0"
        aria-hidden="true"
      >
        <span className="absolute left-0 top-[18px] w-1/2 border-t border-border" />
        <span className="absolute bottom-[18px] left-0 w-1/2 border-t border-border" />
        <span className="absolute bottom-[18px] left-1/2 top-[18px] border-l border-border" />
        <span className="absolute left-1/2 right-0 top-1/2 border-t border-border" />
      </div>
    ) : (
      <div
        className="relative h-20 w-5 shrink-0"
        aria-hidden="true"
      >
        <span className="absolute right-0 top-[18px] w-1/2 border-t border-border" />
        <span className="absolute bottom-[18px] right-0 w-1/2 border-t border-border" />
        <span className="absolute bottom-[18px] left-1/2 top-[18px] border-l border-border" />
        <span className="absolute left-0 right-1/2 top-1/2 border-t border-border" />
      </div>
    );

  const stage = (
    <span className="shrink-0 whitespace-nowrap rounded-md border border-border/60 bg-muted/40 px-1.5 py-1 text-[8px] font-semibold text-muted-foreground">
      {stageLabel}
    </span>
  );

  return (
    <div
      className={`grid min-w-0 items-center gap-1 ${
        side == "left"
          ? "grid-cols-[minmax(0,1fr)_20px_auto]"
          : "grid-cols-[auto_20px_minmax(0,1fr)]"
      }`}
    >
      {side == "left" ? (
        <>
          {matchCards}
          {connector}
          {stage}
        </>
      ) : (
        <>
          {stage}
          {connector}
          {matchCards}
        </>
      )}
    </div>
  );
}

export function AdminChampionshipKnockoutPairingPreview({
  competition,
  qualificationMode,
  pairingMode,
}: Props) {
  const projectedConfig =
    resolveCompetitionConfigByQualificationMode(
      {
        qualifiers_per_group:
          competition.qualifiers_per_group,
        should_complete_knockout_with_best_second_placed_teams:
          competition.should_complete_knockout_with_best_second_placed_teams ??
          false,
      },
      qualificationMode,
    );

  const projectionInput = {
    groups_count: competition.groups_count,
    qualifiers_per_group:
      projectedConfig.qualifiers_per_group,
    should_complete_knockout_with_best_second_placed_teams:
      projectedConfig.should_complete_knockout_with_best_second_placed_teams,
  };

  const projection =
    resolveChampionshipBracketKnockoutProjection(
      projectionInput,
    );

  const actualBracketSize = projection.projected_bracket_size;

  const previewBracketSize =
    actualBracketSize > 0 && actualBracketSize <= 8
      ? 8
      : actualBracketSize;

  const seedLabels =
    resolveChampionshipBracketSeedPlaceholderLabels(
      projectionInput,
    );

  const previewSeedLabels = [...seedLabels];

  while (
    previewSeedLabels.length < previewBracketSize
  ) {
    previewSeedLabels.push("BYE");
  }

  const seedOrder =
    resolveBracketPairingByMode(
      pairingMode,
      previewBracketSize,
    );

  const orderedLabels = seedOrder.map(
    (seed) =>
      previewSeedLabels[seed - 1] ??
      "BYE",
  );

  const matches: PreviewMatch[] = [];

  for (
    let index = 0;
    index < orderedLabels.length;
    index += 2
  ) {
    matches.push({
      home:
        orderedLabels[index] ??
        "A definir",
      away:
        orderedLabels[index + 1] ??
        "A definir",
    });
  }

  if (previewBracketSize < 2 || matches.length === 0) {
    return (
      <div className="rounded-lg border border-border/50 bg-background/40 p-2.5">
        <p className="text-[9px] text-muted-foreground">
          Sem mata-mata projetado.
        </p>
      </div>
    );
  }

  if (previewBracketSize === 8) {
    return (
      <div className="rounded-lg border border-border/50 bg-background/40 p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground">
            Prévia do chaveamento
          </span>

          <span className="text-[8px] text-muted-foreground">
            Quartas → Final
          </span>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_10px_auto_10px_minmax(0,1fr)] items-center gap-1">
          <TwoMatchSide
            matches={matches.slice(0, 2)}
            side="left"
            stageLabel="Semi 1"
          />

          <div
            className="border-t border-border"
            aria-hidden="true"
          />

          <span className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[8px] font-bold text-primary">
            FINAL
          </span>

          <div
            className="border-t border-border"
            aria-hidden="true"
          />

          <TwoMatchSide
            matches={matches.slice(2, 4)}
            side="right"
            stageLabel="Semi 2"
          />
        </div>
      </div>
    );
  }

  const half = Math.ceil(matches.length / 2);

  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[8px] font-medium uppercase tracking-wide text-muted-foreground">
          Prévia compacta
        </span>

        <span className="text-[8px] text-muted-foreground">
          {previewBracketSize} vagas
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="space-y-1">
          {matches
            .slice(0, half)
            .map((match, index) => (
              <MatchMiniCard
                key={`left-${index}`}
                match={match}
              />
            ))}
        </div>

        <span className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[8px] font-bold text-primary">
          FINAL
        </span>

        <div className="space-y-1">
          {matches
            .slice(half)
            .map((match, index) => (
              <MatchMiniCard
                key={`right-${index}`}
                match={match}
                align="right"
              />
            ))}
        </div>
      </div>
    </div>
  );
}
