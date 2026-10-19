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

/** Compare selected hits with required hits; correct rests never add points. */
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
  const matchedHits = requiredHits - missedHits;
  const totalDistinctHits = requiredHits + extraHits;
  return {
    requiredHits,
    missedHits,
    extraHits,
    mistakeCount,
    matchedHits,
    // An empty answer always scores zero, including against an empty solution.
    accuracy:
      totalDistinctHits === 0
        ? 0
        : Math.round((100 * matchedHits) / totalDistinctHits),
  };
}

export function scorePattern(
  answer: RhythmPattern,
  solution: RhythmPattern,
): number {
  return getScoreDetails(answer, solution).accuracy;
}
