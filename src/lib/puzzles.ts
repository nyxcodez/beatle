import {
  DIFFICULTIES,
  STEP_COUNT,
  TRACKS,
  type Puzzle,
  type RhythmPattern,
} from "./types";

/** Throw early for malformed content or persisted answers before they reach audio. */
export function validatePattern(
  value: unknown,
): asserts value is RhythmPattern {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("A rhythm must contain kick, snare, and hihat tracks.");
  }

  const tracks = value as Record<string, unknown>;
  if (Object.keys(tracks).length !== TRACKS.length) {
    throw new Error("A rhythm must contain exactly three tracks.");
  }

  for (const { id } of TRACKS) {
    const steps = tracks[id];
    if (!Array.isArray(steps) || steps.length !== STEP_COUNT) {
      throw new Error(`${id} must contain exactly ${STEP_COUNT} steps.`);
    }
    // Array#every skips holes, so inspect each position explicitly.
    for (let step = 0; step < STEP_COUNT; step += 1) {
      if (typeof steps[step] !== "boolean") {
        throw new Error(`${id} step ${step + 1} must be a boolean.`);
      }
    }
  }
}

export function validatePuzzle(value: unknown): asserts value is Puzzle {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("A puzzle must be an object.");
  }
  const puzzle = value as Record<string, unknown>;
  if (typeof puzzle.id !== "string" || !puzzle.id.trim()) {
    throw new Error("A puzzle needs a nonempty ID.");
  }
  if (typeof puzzle.title !== "string" || !puzzle.title.trim()) {
    throw new Error("A puzzle needs a title.");
  }
  if (
    typeof puzzle.bpm !== "number" ||
    !Number.isFinite(puzzle.bpm) ||
    puzzle.bpm < 40 ||
    puzzle.bpm > 240
  ) {
    throw new Error("Puzzle BPM must be a finite number between 40 and 240.");
  }
  validatePattern(puzzle.pattern);
  if (!DIFFICULTIES.some((difficulty) => difficulty === puzzle.difficulty)) {
    throw new Error("Puzzle difficulty must be easy, medium, or hard.");
  }
}

function rhythm(kick: string, snare: string, hihat: string): RhythmPattern {
  const parse = (steps: string): boolean[] => {
    if (!/^[x.]{16}$/.test(steps)) throw new Error("Invalid curated rhythm.");
    return [...steps].map((step) => step === "x");
  };
  return { kick: parse(kick), snare: parse(snare), hihat: parse(hihat) };
}

/** The first round is deliberately approachable and doubles as the core demo. */
export const DEMO_PUZZLE: Puzzle = {
  id: "pocket-01",
  title: "In the pocket",
  bpm: 96,
  difficulty: "easy",
  pattern: rhythm("x.....x.x.......", "....x.......x...", "x.x.x.x.x.x.x.x."),
};

/** Hand-curated one-bar grooves; each step is one sixteenth note in 4/4. */
export const PUZZLES: readonly Puzzle[] = [
  DEMO_PUZZLE,
  {
    id: "midnight-02",
    title: "Midnight drive",
    bpm: 104,
    difficulty: "medium",
    pattern: rhythm("x.......x.x.....", "....x.......x...", "x.x.x.x.x.x.x.xx"),
  },
  {
    id: "sidewalk-03",
    title: "Sidewalk shuffle",
    bpm: 92,
    difficulty: "medium",
    pattern: rhythm("x.....x...x.....", "....x.......x..x", "x.x.x.x.x.x.x.x."),
  },
  {
    id: "afterhours-04",
    title: "After hours",
    bpm: 88,
    difficulty: "easy",
    pattern: rhythm("x.......x.....x.", "........x.......", "x.x.x.x.x.x.x.xx"),
  },
  {
    id: "fourfloor-05",
    title: "Four on the floor",
    bpm: 116,
    difficulty: "easy",
    pattern: rhythm("x...x...x...x...", "....x.......x...", "..x...x...x...x."),
  },
  {
    id: "littlebreak-06",
    title: "A little break",
    bpm: 100,
    difficulty: "medium",
    pattern: rhythm("x.....x...x...x.", "....x.......x.x.", "x.x.x.x.xx..x.x."),
  },
  {
    id: "slowburn-07",
    title: "Slow burn",
    bpm: 80,
    difficulty: "easy",
    pattern: rhythm("x.........x.....", "....x.......x...", "x...x...x...x..."),
  },
  {
    id: "neon-08",
    title: "Neon lights",
    bpm: 112,
    difficulty: "hard",
    pattern: rhythm("x..x....x..x....", "....x.......x...", "x.x.x.xx..x.x.xx"),
  },
  {
    id: "backbeat-09",
    title: "Backbeat bounce",
    bpm: 108,
    difficulty: "medium",
    pattern: rhythm("x.x.....x.....x.", "....x......xx...", "x.x.x.x.x.x.x.x."),
  },
  {
    id: "moonwalk-10",
    title: "Moonwalk",
    bpm: 94,
    difficulty: "hard",
    pattern: rhythm("x......xx.....x.", "....x.......x...", "..x.x.x...x.x.xx"),
  },
  {
    id: "golden-11",
    title: "Golden hour",
    bpm: 102,
    difficulty: "hard",
    pattern: rhythm("x.....x.x..x....", "....x.......x.x.", "x.x.x.x.x.x.x.xx"),
  },
  {
    id: "lasttrain-12",
    title: "Last train",
    bpm: 120,
    difficulty: "hard",
    pattern: rhythm("x...x...x.....x.", "....x.....x.x...", "xxxx..xxx.x.x.xx"),
  },
];

for (const puzzle of PUZZLES) validatePuzzle(puzzle);
