import { validatePattern } from "./puzzles";
import { STEP_COUNT, TRACKS, type RhythmPattern } from "./types";

export interface ScoreDetails {
  correctCells: number;
  totalCells: number;
  accuracy: number;
}

/** Every hit and rest has equal weight: correct cells / 48, rounded to percent. */
export function getScoreDetails(
  answer: RhythmPattern,
  solution: RhythmPattern,
): ScoreDetails {
  validatePattern(answer);
  validatePattern(solution);
  let correctCells = 0;
  for (const { id } of TRACKS) {
    for (let step = 0; step < STEP_COUNT; step += 1) {
      if (answer[id][step] === solution[id][step]) correctCells += 1;
    }
  }
  const totalCells = TRACKS.length * STEP_COUNT;
  return {
    correctCells,
    totalCells,
    accuracy: Math.round((correctCells / totalCells) * 100),
  };
}

export function scorePattern(
  answer: RhythmPattern,
  solution: RhythmPattern,
): number {
  return getScoreDetails(answer, solution).accuracy;
}
