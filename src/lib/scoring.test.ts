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

  it("does not penalize extra hits, as specified by the required-hit formula", () => {
    const extraHit = clonePattern(DEMO_PUZZLE.pattern);
    extraHit.snare[0] = true;
    expect(scorePattern(extraHit, DEMO_PUZZLE.pattern)).toBe(100);
    const allSelected = createEmptyPattern();
    for (const { id } of TRACKS) allSelected[id].fill(true);
    expect(scorePattern(allSelected, DEMO_PUZZLE.pattern)).toBe(100);
  });

  it("uses the required hits as the denominator and rounds fractional scores", () => {
    const missedHit = clonePattern(DEMO_PUZZLE.pattern);
    missedHit.snare[4] = false;
    expect(getScoreDetails(missedHit, DEMO_PUZZLE.pattern)).toEqual({
      requiredHits: 13,
      missedHits: 1,
      matchedHits: 12,
      accuracy: 92,
    });
    missedHit.kick[0] = false;
    missedHit.snare[0] = true;
    expect(scorePattern(missedHit, DEMO_PUZZLE.pattern)).toBe(85);
    const sparseSolution = createEmptyPattern();
    sparseSolution.kick[0] = true;
    sparseSolution.snare[4] = true;
    sparseSolution.hihat[8] = true;
    const oneHit = createEmptyPattern();
    oneHit.kick[0] = true;
    expect(scorePattern(oneHit, sparseSolution)).toBe(33);
  });

  it("gives 100 points when the solution has no required hits", () => {
    const answer = createEmptyPattern();
    answer.snare[4] = true;
    expect(getScoreDetails(answer, createEmptyPattern())).toEqual({
      requiredHits: 0,
      missedHits: 0,
      matchedHits: 0,
      accuracy: 100,
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
