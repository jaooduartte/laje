import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260913160000_normalize_interlaje_volleyball_cross_group_seeding.sql",
  ),
  "utf8",
);

type Candidate = {
  name: string;
  qualificationRank: number;
  points: number;
  matches: number;
  rallyDifference: number;
  rallyPointsFor: number;
  rallyPointsAgainst: number;
  setsFor: number;
  setsAgainst: number;
};

function rankCandidates(candidates: Candidate[]) {
  const maximumMatches = Math.max(
    ...candidates.map((candidate) => candidate.matches),
  );

  return [...candidates]
    .sort((firstCandidate, secondCandidate) => {
      const firstFactor = maximumMatches / firstCandidate.matches;
      const secondFactor = maximumMatches / secondCandidate.matches;
      const firstSetsAverage = firstCandidate.setsAgainst === 0
        ? Number.POSITIVE_INFINITY
        : firstCandidate.setsFor / firstCandidate.setsAgainst;
      const secondSetsAverage = secondCandidate.setsAgainst === 0
        ? Number.POSITIVE_INFINITY
        : secondCandidate.setsFor / secondCandidate.setsAgainst;

      return (
        firstCandidate.qualificationRank - secondCandidate.qualificationRank ||
        secondCandidate.points * secondFactor - firstCandidate.points * firstFactor ||
        secondCandidate.rallyDifference * secondFactor -
          firstCandidate.rallyDifference * firstFactor ||
        secondCandidate.rallyPointsFor * secondFactor -
          firstCandidate.rallyPointsFor * firstFactor ||
        firstCandidate.rallyPointsAgainst * firstFactor -
          secondCandidate.rallyPointsAgainst * secondFactor ||
        secondSetsAverage - firstSetsAverage ||
        secondCandidate.setsFor * secondFactor - firstCandidate.setsFor * firstFactor ||
        firstCandidate.setsAgainst * firstFactor -
          secondCandidate.setsAgainst * secondFactor ||
        firstCandidate.name.localeCompare(secondCandidate.name)
      );
    })
    .map((candidate) => candidate.name);
}

function resolveRankingAlternatingMatches(seeds: string[]) {
  const seedOrder = [1, 8, 3, 6, 2, 7, 4, 5];

  return Array.from({ length: seedOrder.length / 2 }, (_, matchIndex) => {
    const homeSeed = seedOrder[matchIndex * 2];
    const awaySeed = seedOrder[matchIndex * 2 + 1];

    return `${seeds[homeSeed - 1]} x ${seeds[awaySeed - 1]}`;
  });
}

describe("Interlaje volleyball cross-group seeding migration", () => {
  it("preserves the existing qualification ranking for non-volleyball competitions", () => {
    expect(migration).toContain(
      "get_interlaje_qualification_pool_ranking_legacy",
    );
    expect(migration).toContain(
      "get_championship_bracket_competition_qualification_pool_ranking",
    );
    expect(migration).toContain("is_interlaje_volleyball");
  });

  it("normalizes points, rally metrics and set metrics by the programmed group size", () => {
    expect(migration).toContain("AS comparison_points");
    expect(migration).toContain("AS comparison_rally_point_difference");
    expect(migration).toContain("AS comparison_rally_points_for");
    expect(migration).toContain("AS comparison_rally_points_against");
    expect(migration).toContain("AS comparison_sets_for");
    expect(migration).toContain("AS comparison_sets_against");
    expect(migration).toContain("AS sets_average");
  });

  it("reproduces the female volleyball seed order from the official schedule", () => {
    const seeds = rankCandidates([
        { name: "AAAMU", qualificationRank: 1, points: 9, matches: 3, rallyDifference: 34, rallyPointsFor: 151, rallyPointsAgainst: 117, setsFor: 6, setsAgainst: 0 },
        { name: "RAPOSAS", qualificationRank: 1, points: 6, matches: 2, rallyDifference: 60, rallyPointsFor: 100, rallyPointsAgainst: 40, setsFor: 4, setsAgainst: 0 },
        { name: "UEFA", qualificationRank: 1, points: 6, matches: 2, rallyDifference: 40, rallyPointsFor: 100, rallyPointsAgainst: 60, setsFor: 4, setsAgainst: 0 },
        { name: "AAAUS", qualificationRank: 1, points: 6, matches: 2, rallyDifference: 37, rallyPointsFor: 100, rallyPointsAgainst: 63, setsFor: 4, setsAgainst: 0 },
        { name: "CCT", qualificationRank: 1, points: 8, matches: 3, rallyDifference: 81, rallyPointsFor: 156, rallyPointsAgainst: 75, setsFor: 6, setsAgainst: 1 },
        { name: "AAASF", qualificationRank: 2, points: 7, matches: 3, rallyDifference: 65, rallyPointsFor: 158, rallyPointsAgainst: 93, setsFor: 5, setsAgainst: 2 },
        { name: "ADIN", qualificationRank: 2, points: 6, matches: 3, rallyDifference: 55, rallyPointsFor: 146, rallyPointsAgainst: 91, setsFor: 4, setsAgainst: 2 },
        { name: "ABUS", qualificationRank: 2, points: 3, matches: 2, rallyDifference: 24, rallyPointsFor: 90, rallyPointsAgainst: 66, setsFor: 2, setsAgainst: 2 },
      ]);

    expect(seeds).toEqual([
      "RAPOSAS",
      "UEFA",
      "AAAUS",
      "AAAMU",
      "CCT",
      "AAASF",
      "ADIN",
      "ABUS",
    ]);
    expect(resolveRankingAlternatingMatches(seeds)).toEqual([
      "RAPOSAS x ABUS",
      "AAAUS x AAASF",
      "UEFA x ADIN",
      "AAAMU x CCT",
    ]);
  });

  it("reproduces the male volleyball seed order from the official schedule", () => {
    const seeds = rankCandidates([
        { name: "UEFA", qualificationRank: 1, points: 9, matches: 3, rallyDifference: 68, rallyPointsFor: 150, rallyPointsAgainst: 82, setsFor: 6, setsAgainst: 0 },
        { name: "AAASF", qualificationRank: 1, points: 9, matches: 3, rallyDifference: 42, rallyPointsFor: 150, rallyPointsAgainst: 108, setsFor: 6, setsAgainst: 0 },
        { name: "CCT", qualificationRank: 1, points: 6, matches: 2, rallyDifference: 67, rallyPointsFor: 100, rallyPointsAgainst: 33, setsFor: 4, setsAgainst: 0 },
        { name: "CAMALEÃO", qualificationRank: 1, points: 6, matches: 2, rallyDifference: 33, rallyPointsFor: 100, rallyPointsAgainst: 67, setsFor: 4, setsAgainst: 0 },
        { name: "TAUROS", qualificationRank: 1, points: 5, matches: 2, rallyDifference: 27, rallyPointsFor: 109, rallyPointsAgainst: 82, setsFor: 4, setsAgainst: 1 },
        { name: "AMEN", qualificationRank: 2, points: 6, matches: 3, rallyDifference: 34, rallyPointsFor: 138, rallyPointsAgainst: 104, setsFor: 4, setsAgainst: 2 },
        { name: "AAAUS", qualificationRank: 2, points: 6, matches: 3, rallyDifference: 33, rallyPointsFor: 138, rallyPointsAgainst: 105, setsFor: 4, setsAgainst: 2 },
        { name: "GARRUDOS", qualificationRank: 2, points: 4, matches: 2, rallyDifference: 28, rallyPointsFor: 108, rallyPointsAgainst: 80, setsFor: 3, setsAgainst: 2 },
      ]);

    expect(seeds).toEqual([
      "CCT",
      "UEFA",
      "CAMALEÃO",
      "AAASF",
      "TAUROS",
      "GARRUDOS",
      "AMEN",
      "AAAUS",
    ]);
    expect(resolveRankingAlternatingMatches(seeds)).toEqual([
      "CCT x AAAUS",
      "CAMALEÃO x GARRUDOS",
      "UEFA x AMEN",
      "AAASF x TAUROS",
    ]);
  });

  it("refreshes only current Interlaje volleyball brackets without a live or finished knockout match", () => {
    expect(migration).toContain("editions_table.season_year = championships_table.current_season_year");
    expect(migration).toContain("matches_table.status <> 'SCHEDULED'::public.match_status");
    expect(migration).toContain(
      "refresh_championship_knockout_competition_after_disqualification",
    );
  });
});
