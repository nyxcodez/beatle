import { describe, expect, it } from "vitest";
import { DEMO_PUZZLE } from "./puzzles";
import { getScoreDetails, scorePattern } from "./scoring";
import {
  clonePattern,
  createEmptyPattern,
  type RhythmPattern,
  TRACKS,
} from "./types";

describe("per-cell rhythm scoring", () => {
  it("gives a perfect answer 100 points", () => {
    expect(
      scorePattern(clonePattern(DEMO_PUZZLE.pattern), DEMO_PUZZLE.pattern),
    ).toBe(100);
  });

  it("counts correct rests and missed hits in an empty answer", () => {
    // The example contains 13 hits and 35 rests across all 48 cells.
    expect(getScoreDetails(createEmptyPattern(), DEMO_PUZZLE.pattern)).toEqual({
      correctCells: 35,
      totalCells: 48,
      accuracy: 73,
    });
  });

  it("gives opposite answers zero points and empty matching patterns full points", () => {
    const opposite = clonePattern(DEMO_PUZZLE.pattern);
    for (const { id } of TRACKS) opposite[id] = opposite[id].map((hit) => !hit);
    expect(scorePattern(opposite, DEMO_PUZZLE.pattern)).toBe(0);
    expect(scorePattern(createEmptyPattern(), createEmptyPattern())).toBe(100);
  });

  it("penalizes extra hits and missed hits equally and rounds to whole percentages", () => {
    const extraHit = clonePattern(DEMO_PUZZLE.pattern);
    extraHit.snare[0] = true;
    const missedHit = clonePattern(DEMO_PUZZLE.pattern);
    missedHit.snare[4] = false;
    expect(scorePattern(extraHit, DEMO_PUZZLE.pattern)).toBe(98);
    expect(scorePattern(missedHit, DEMO_PUZZLE.pattern)).toBe(98);
    extraHit.kick[0] = false;
    expect(scorePattern(extraHit, DEMO_PUZZLE.pattern)).toBe(96);
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
