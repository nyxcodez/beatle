import { describe, expect, it } from "vitest";
import { DEMO_PUZZLE } from "./puzzles";
import { getScoreDetails, scorePattern } from "./scoring";
import {
  clonePattern,
  createEmptyPattern,
  type RhythmPattern,
  TRACKS,
} from "./types";

describe("required-hit rhythm scoring", () => {
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

  it("gives opposite answers zero points and empty matching patterns full points", () => {
    const opposite = clonePattern(DEMO_PUZZLE.pattern);
    for (const { id } of TRACKS) opposite[id] = opposite[id].map((hit) => !hit);
    expect(scorePattern(opposite, DEMO_PUZZLE.pattern)).toBe(0);
    expect(scorePattern(createEmptyPattern(), createEmptyPattern())).toBe(100);
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

  it("penalizes extra hits with the same required-hit denominator as missed hits", () => {
    const extraHit = clonePattern(DEMO_PUZZLE.pattern);
    extraHit.snare[0] = true;
    expect(getScoreDetails(extraHit, DEMO_PUZZLE.pattern)).toEqual({
      requiredHits: 13,
      missedHits: 0,
      extraHits: 1,
      mistakeCount: 1,
      matchedHits: 13,
      accuracy: 92,
    });
    const missedHit = clonePattern(DEMO_PUZZLE.pattern);
    missedHit.snare[4] = false;
    expect(scorePattern(extraHit, DEMO_PUZZLE.pattern)).toBe(
      scorePattern(missedHit, DEMO_PUZZLE.pattern),
    );
  });

  it("does not reward selecting every pad and clamps excessive mistakes to zero", () => {
    const allSelected = createEmptyPattern();
    for (const { id } of TRACKS) allSelected[id].fill(true);
    expect(getScoreDetails(allSelected, DEMO_PUZZLE.pattern)).toEqual({
      requiredHits: 13,
      missedHits: 0,
      extraHits: 35,
      mistakeCount: 35,
      matchedHits: 13,
      accuracy: 0,
    });
  });

  it("uses the required hits as the denominator and rounds fractional scores", () => {
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
      accuracy: 77,
    });
    const sparseSolution = createEmptyPattern();
    sparseSolution.kick[0] = true;
    sparseSolution.snare[4] = true;
    sparseSolution.hihat[8] = true;
    const oneHit = createEmptyPattern();
    oneHit.kick[0] = true;
    expect(scorePattern(oneHit, sparseSolution)).toBe(33);
  });

  it("gives a silent solution 100 only for a silent answer and zero for any extra hit", () => {
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
