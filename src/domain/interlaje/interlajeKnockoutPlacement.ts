export interface InterlajeKnockoutLoser {
  teamId: string;
  eliminatedByTeamId: string;
}

export interface InterlajeKnockoutPlacementInput {
  championTeamId: string;
  runnerUpTeamId: string;
  semifinalLosers: InterlajeKnockoutLoser[];
  quarterfinalLosers?: InterlajeKnockoutLoser[];
}

/**
 * Espelho de domínio da regra oficial aplicada no SQL da LAJE-103.
 *
 * 1º campeão; 2º vice; o derrotado pelo campeão na semi fica em 3º e o
 * derrotado pelo vice em 4º. Havendo quartas, seus derrotados ocupam 5º-8º
 * conforme a colocação final de quem os eliminou.
 */
export function resolveInterlajeKnockoutPullAlongPositions(
  input: InterlajeKnockoutPlacementInput,
): Map<string, number> {
  const positions = new Map<string, number>([
    [input.championTeamId, 1],
    [input.runnerUpTeamId, 2],
  ]);

  const semifinalLoserToChampion = input.semifinalLosers.find(
    (loser) => loser.eliminatedByTeamId == input.championTeamId,
  );
  const semifinalLoserToRunnerUp = input.semifinalLosers.find(
    (loser) => loser.eliminatedByTeamId == input.runnerUpTeamId,
  );

  if (!semifinalLoserToChampion || !semifinalLoserToRunnerUp) {
    throw new Error("A chave não permite resolver 3º e 4º colocados.");
  }

  positions.set(semifinalLoserToChampion.teamId, 3);
  positions.set(semifinalLoserToRunnerUp.teamId, 4);

  const quarterfinalLosers = input.quarterfinalLosers ?? [];

  if (quarterfinalLosers.length == 0) {
    return positions;
  }

  if (quarterfinalLosers.length != 4) {
    throw new Error("Uma chave com quartas deve possuir quatro eliminadas nessa fase.");
  }

  quarterfinalLosers.forEach((loser) => {
    const eliminatorPosition = positions.get(loser.eliminatedByTeamId);

    if (eliminatorPosition == null || eliminatorPosition < 1 || eliminatorPosition > 4) {
      throw new Error("A eliminadora das quartas precisa terminar entre 1º e 4º.");
    }

    positions.set(loser.teamId, eliminatorPosition + 4);
  });

  return positions;
}
