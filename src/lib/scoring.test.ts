import { describe, expect, it } from "vitest";
import { DEMO_PUZZLE, PUZZLES } from "./puzzles";
import { getScoreDetails, scorePattern } from "./scoring";
import {
  clonePattern,
  createEmptyPattern,
  type RhythmPattern,
  TRACKS,
} from "./types";

describe("hit overlap rhythm scoring", () => {
  it("gives a perfect answer 100 points", () => {
    expect(
      scorePattern(clonePattern(DEMO_PUZZLE.pattern), DEMO_PUZZLE.pattern),
    ).toBe(100);
  });

  it("gives an empty answer zero points when the solution contains hits", () => {
    // All 13 required hits are missing; correct rests do not add points.
    expect(getScoreDetails(createEmptyPattern(), DEMO_PUZZLE.pattern)).toEqual({
      requiredHits: 13,
      missedHits: 13,
      extraHits: 0,
      mistakeCount: 13,
      matchedHits: 0,
      accuracy: 0,
    });
  });

  it("gives opposite answers and empty matching patterns zero points", () => {
    const opposite = clonePattern(DEMO_PUZZLE.pattern);
    for (const { id } of TRACKS) opposite[id] = opposite[id].map((hit) => !hit);
    expect(scorePattern(opposite, DEMO_PUZZLE.pattern)).toBe(0);
    expect(scorePattern(createEmptyPattern(), createEmptyPattern())).toBe(0);
  });

  it("scores a blank answer zero and a perfect answer 100 for every curated puzzle", () => {
    for (const puzzle of PUZZLES) {
      expect(scorePattern(createEmptyPattern(), puzzle.pattern)).toBe(0);
      expect(scorePattern(clonePattern(puzzle.pattern), puzzle.pattern)).toBe(
        100,
      );
    }
  });

  it("gives zero for every fully missed nonempty solution, without floating-point negative zero", () => {
    const solution = createEmptyPattern();
    for (const { id } of TRACKS) {
      for (let step = 0; step < solution[id].length; step += 1) {
        solution[id][step] = true;
        expect(scorePattern(createEmptyPattern(), solution)).toBe(0);
      }
    }
  });

  it("penalizes extra hits by adding them to the hit overlap denominator", () => {
    const extraHit = clonePattern(DEMO_PUZZLE.pattern);
    extraHit.snare[0] = true;
    expect(getScoreDetails(extraHit, DEMO_PUZZLE.pattern)).toEqual({
      requiredHits: 13,
      missedHits: 0,
      extraHits: 1,
      mistakeCount: 1,
      matchedHits: 13,
      accuracy: 93,
    });
    const missedHit = clonePattern(DEMO_PUZZLE.pattern);
    missedHit.snare[4] = false;
    expect(scorePattern(missedHit, DEMO_PUZZLE.pattern)).toBe(92);
  });

  it("penalizes selecting every pad according to the fraction of required hits", () => {
    const allSelected = createEmptyPattern();
    for (const { id } of TRACKS) allSelected[id].fill(true);
    expect(getScoreDetails(allSelected, DEMO_PUZZLE.pattern)).toEqual({
      requiredHits: 13,
      missedHits: 0,
      extraHits: 35,
      mistakeCount: 35,
      matchedHits: 13,
      accuracy: 27,
    });
  });

  it("rounds fractional scores with both missed and extra hits", () => {
    const missedHit = clonePattern(DEMO_PUZZLE.pattern);
    missedHit.snare[4] = false;
    expect(getScoreDetails(missedHit, DEMO_PUZZLE.pattern)).toEqual({
      requiredHits: 13,
      missedHits: 1,
      extraHits: 0,
      mistakeCount: 1,
      matchedHits: 12,
      accuracy: 92,
    });
    missedHit.kick[0] = false;
    missedHit.snare[0] = true;
    expect(getScoreDetails(missedHit, DEMO_PUZZLE.pattern)).toEqual({
      requiredHits: 13,
      missedHits: 2,
      extraHits: 1,
      mistakeCount: 3,
      matchedHits: 11,
      accuracy: 79,
    });
    const sparseSolution = createEmptyPattern();
    sparseSolution.kick[0] = true;
    sparseSolution.snare[4] = true;
    sparseSolution.hihat[8] = true;
    const oneHit = createEmptyPattern();
    oneHit.kick[0] = true;
    expect(scorePattern(oneHit, sparseSolution)).toBe(33);
  });

  it("scores twelve correct hits with two extras 86 and eight with two extras 57", () => {
    const solution = createEmptyPattern();
    solution.kick.fill(true, 0, 12);
    const answer = clonePattern(solution);
    answer.snare[0] = true;
    answer.snare[1] = true;
    expect(scorePattern(answer, solution)).toBe(86);
    answer.kick.fill(false, 8, 12);
    expect(getScoreDetails(answer, solution)).toEqual({
      requiredHits: 12,
      missedHits: 4,
      extraHits: 2,
      mistakeCount: 6,
      matchedHits: 8,
      accuracy: 57,
    });
  });

  it("gives a silent solution zero for both silent answers and extra hits", () => {
    const answer = createEmptyPattern();
    answer.snare[4] = true;
    expect(getScoreDetails(answer, createEmptyPattern())).toEqual({
      requiredHits: 0,
      missedHits: 0,
      extraHits: 1,
      mistakeCount: 1,
      matchedHits: 0,
      accuracy: 0,
    });
    expect(scorePattern(createEmptyPattern(), createEmptyPattern())).toBe(0);
  });

  it("rejects malformed answers and solutions instead of producing misleading scores", () => {
    const malformed = { ...createEmptyPattern(), kick: [true] };
    expect(() => scorePattern(malformed, DEMO_PUZZLE.pattern)).toThrow();
    expect(() => scorePattern(createEmptyPattern(), malformed)).toThrow();
    expect(() =>
      scorePattern(null as unknown as RhythmPattern, DEMO_PUZZLE.pattern),
    ).toThrow();
  });
});
