import { validatePattern } from "./puzzles";
import { STEP_COUNT, TRACKS, type RhythmPattern } from "./types";

export interface ScoreDetails {
  requiredHits: number;
  missedHits: number;
  extraHits: number;
  mistakeCount: number;
  matchedHits: number;
  accuracy: number;
}

/** Missing and extra hits each cost 100 / requiredHits, with a minimum score of zero. */
export function getScoreDetails(
  answer: RhythmPattern,
  solution: RhythmPattern,
): ScoreDetails {
  validatePattern(answer);
  validatePattern(solution);
  let requiredHits = 0;
  let missedHits = 0;
  let extraHits = 0;
  for (const { id } of TRACKS) {
    for (let step = 0; step < STEP_COUNT; step += 1) {
      if (solution[id][step]) {
        requiredHits += 1;
        if (!answer[id][step]) missedHits += 1;
      } else if (answer[id][step]) {
        extraHits += 1;
      }
    }
  }
  const mistakeCount = missedHits + extraHits;
  return {
    requiredHits,
    missedHits,
    extraHits,
    mistakeCount,
    matchedHits: requiredHits - missedHits,
    // Silence matches only silence when there are no required hits.
    accuracy:
      requiredHits === 0
        ? extraHits === 0
          ? 100
          : 0
        : Math.max(0, Math.round(100 - (100 / requiredHits) * mistakeCount)),
  };
}

export function scorePattern(
  answer: RhythmPattern,
  solution: RhythmPattern,
): number {
  return getScoreDetails(answer, solution).accuracy;
}
