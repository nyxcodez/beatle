import { validatePattern } from "./puzzles";
import { STEP_COUNT, TRACKS, type RhythmPattern } from "./types";

export interface ScoreDetails {
  requiredHits: number;
  missedHits: number;
  matchedHits: number;
  accuracy: number;
}

/** Score required hits using 100 - (100 / requiredHits) * missedHits. */
export function getScoreDetails(
  answer: RhythmPattern,
  solution: RhythmPattern,
): ScoreDetails {
  validatePattern(answer);
  validatePattern(solution);
  let requiredHits = 0;
  let missedHits = 0;
  for (const { id } of TRACKS) {
    for (let step = 0; step < STEP_COUNT; step += 1) {
      if (solution[id][step]) {
        requiredHits += 1;
        if (!answer[id][step]) missedHits += 1;
      }
    }
  }
  return {
    requiredHits,
    missedHits,
    matchedHits: requiredHits - missedHits,
    // With no required hits, there are no misses to penalize.
    accuracy:
      requiredHits === 0
        ? 100
        : Math.max(0, Math.round(100 - (100 / requiredHits) * missedHits)),
  };
}

export function scorePattern(
  answer: RhythmPattern,
  solution: RhythmPattern,
): number {
  return getScoreDetails(answer, solution).accuracy;
}
