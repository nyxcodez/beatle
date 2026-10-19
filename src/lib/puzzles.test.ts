import { describe, expect, it } from "vitest";
import {
  DEMO_PUZZLE,
  PUZZLES,
  validatePattern,
  validatePuzzle,
} from "./puzzles";
import { createEmptyPattern, DIFFICULTIES, STEP_COUNT } from "./types";

describe("curated puzzle validation", () => {
  it("ships distinct valid puzzles with 16 steps per track", () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(3);
    expect(new Set(PUZZLES.map(({ id }) => id)).size).toBe(PUZZLES.length);
    expect(
      new Set(PUZZLES.map(({ pattern }) => JSON.stringify(pattern))).size,
    ).toBe(PUZZLES.length);
    for (const puzzle of PUZZLES)
      expect(() => validatePuzzle(puzzle)).not.toThrow();
  });

  it.each([null, [], {}, { kick: [], snare: [], hihat: [] }])(
    "rejects an invalid pattern: %j",
    (value) => {
      expect(() => validatePattern(value)).toThrow();
    },
  );

  it("rejects extra tracks, nonboolean cells, and sparse arrays", () => {
    expect(() =>
      validatePattern({ ...createEmptyPattern(), clap: [] }),
    ).toThrow();
    expect(() =>
      validatePattern({
        ...createEmptyPattern(),
        kick: Array(STEP_COUNT).fill(1),
      }),
    ).toThrow();
    expect(() =>
      validatePattern({ ...createEmptyPattern(), kick: Array(STEP_COUNT) }),
    ).toThrow();
  });

  it.each([0, 39, 241, Number.NaN, Number.POSITIVE_INFINITY, "96"])(
    "rejects invalid BPM %s",
    (bpm) => {
      expect(() => validatePuzzle({ ...DEMO_PUZZLE, bpm })).toThrow();
    },
  );

  it("requires a nonempty ID and title", () => {
    expect(() => validatePuzzle({ ...DEMO_PUZZLE, id: " " })).toThrow();
    expect(() => validatePuzzle({ ...DEMO_PUZZLE, title: "" })).toThrow();
  });

  it("creates independent answer arrays", () => {
    const first = createEmptyPattern();
    const second = createEmptyPattern();
    first.kick[0] = true;
    expect(first.snare[0]).toBe(false);
    expect(second.kick[0]).toBe(false);
  });

  it("provides varied curated choices at every difficulty", () => {
    for (const difficulty of DIFFICULTIES) {
      expect(
        PUZZLES.filter((puzzle) => puzzle.difficulty === difficulty),
      ).toHaveLength(4);
    }
    expect(DEMO_PUZZLE.difficulty).toBe("easy");
  });

  it.each([undefined, null, "", "expert", 1])(
    "rejects invalid difficulty %s",
    (difficulty) => {
      expect(() => validatePuzzle({ ...DEMO_PUZZLE, difficulty })).toThrow(
        "difficulty",
      );
    },
  );
});
