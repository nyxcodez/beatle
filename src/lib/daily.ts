import { PUZZLES, validatePattern } from "./puzzles";
import { scorePattern } from "./scoring";
import {
  clonePattern,
  createEmptyPattern,
  DIFFICULTIES,
  LISTENING_LOOPS,
  TRACKS,
  type Puzzle,
  type RoundProgress,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1_000;
// UTC arithmetic here only assigns calendar labels a stable ordinal, independent of DST.
const FIRST_CHALLENGE_DAY = Date.UTC(2026, 0, 1);
// The new selection order needs separate answers; retain older UTC records untouched.
const STORAGE_PREFIX = "beatle:daily:local:v3:";
const MAX_RECORD_LENGTH = 16_384;

export interface DailyChallenge {
  dateKey: string;
  number: number;
  puzzles: [Puzzle, Puzzle, Puzzle];
}

export interface DailyProgress {
  dateKey: string;
  rounds: RoundProgress[];
}

export interface LoadedDailyProgress {
  progress: DailyProgress;
  storageAvailable: boolean;
}

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

function dateTimestamp(dateKey: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey))
    throw new Error("A calendar date key must use YYYY-MM-DD.");
  const timestamp = Date.parse(`${dateKey}T00:00:00.000Z`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== dateKey
  ) {
    throw new Error("Invalid calendar date key.");
  }
  return timestamp;
}

export { getLocalDateKey } from "./calendar";

/** Stable 32-bit hashing and shuffling keep selection independent of locale and runtime. */
function seededRandom(dateKey: string): () => number {
  let seed = 2_166_136_261;
  for (const character of dateKey) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16_777_619) >>> 0;
  }
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let mixed = seed;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function copyPuzzle(puzzle: Puzzle): Puzzle {
  return { ...puzzle, pattern: clonePattern(puzzle.pattern) };
}

export function getDailyChallenge(dateKey: string): DailyChallenge {
  const timestamp = dateTimestamp(dateKey);
  const random = seededRandom(dateKey);
  // Curated tiers reflect rhythmic regularity, syncopation, fills, and track interplay.
  // Select one puzzle from each tier instead of shuffling difficulties together.
  const puzzles = DIFFICULTIES.map((difficulty) => {
    const candidates = PUZZLES.filter(
      (puzzle) => puzzle.difficulty === difficulty,
    );
    if (!candidates.length)
      throw new Error(`No ${difficulty} puzzles are available.`);
    return copyPuzzle(candidates[Math.floor(random() * candidates.length)]);
  }) as [Puzzle, Puzzle, Puzzle];
  return {
    dateKey,
    number: Math.floor((timestamp - FIRST_CHALLENGE_DAY) / DAY_MS) + 1,
    puzzles,
  };
}

export function createDailyProgress(dateKey: string): DailyProgress {
  dateTimestamp(dateKey);
  return {
    dateKey,
    rounds: Array.from({ length: 3 }, () => ({
      pattern: createEmptyPattern(),
      completedLoops: 0,
      referenceEnded: false,
      submitted: false,
    })),
  };
}

function isUntouched(round: RoundProgress): boolean {
  return (
    round.completedLoops === 0 &&
    !round.referenceEnded &&
    TRACKS.every(({ id }) => round.pattern[id].every((hit) => !hit))
  );
}

function validateProgress(
  value: unknown,
  expectedDateKey?: string,
): asserts value is DailyProgress {
  if (typeof value !== "object" || value === null)
    throw new Error("Invalid daily progress.");
  const progress = value as Record<string, unknown>;
  if (typeof progress.dateKey !== "string")
    throw new Error("Missing daily date.");
  dateTimestamp(progress.dateKey);
  if (expectedDateKey !== undefined && progress.dateKey !== expectedDateKey) {
    throw new Error("Saved progress belongs to a different local day.");
  }
  if (!Array.isArray(progress.rounds) || progress.rounds.length !== 3) {
    throw new Error("Daily progress must contain exactly three rounds.");
  }
  let activeRoundSeen = false;
  for (const value of progress.rounds) {
    if (typeof value !== "object" || value === null)
      throw new Error("Invalid saved round.");
    const round = value as Record<string, unknown>;
    validatePattern(round.pattern);
    if (
      typeof round.submitted !== "boolean" ||
      typeof round.referenceEnded !== "boolean" ||
      typeof round.completedLoops !== "number" ||
      !Number.isInteger(round.completedLoops) ||
      round.completedLoops < 0 ||
      round.completedLoops > LISTENING_LOOPS
    ) {
      throw new Error("Invalid round status or completed loop count.");
    }
    if (
      !round.referenceEnded &&
      (round.submitted ||
        TRACKS.some(({ id }) =>
          (round.pattern as RoundProgress["pattern"])[id].some(Boolean),
        ))
    ) {
      throw new Error(
        "Finish or stop reference playback before creating an answer.",
      );
    }
    if (round.completedLoops === LISTENING_LOOPS && !round.referenceEnded) {
      throw new Error("Reference playback must end after all six loops.");
    }
    if (
      activeRoundSeen &&
      (round.submitted || !isUntouched(round as unknown as RoundProgress))
    ) {
      throw new Error("Daily rounds must be played and submitted in order.");
    }
    if (!round.submitted) activeRoundSeen = true;
  }
}

function copyProgress(progress: DailyProgress): DailyProgress {
  // Copy only known fields, avoiding unexpected properties from stored JSON.
  return {
    dateKey: progress.dateKey,
    rounds: progress.rounds.map((round) => ({
      pattern: clonePattern(round.pattern),
      submitted: round.submitted,
      completedLoops: round.completedLoops,
      referenceEnded: round.referenceEnded,
    })),
  };
}

export function getDailyStorageKey(dateKey: string): string {
  dateTimestamp(dateKey);
  return `${STORAGE_PREFIX}${dateKey}`;
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Normalize an older record shape without reopening a played reference. */
function migrateReferenceState(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const progress = value as Record<string, unknown>;
  if (!Array.isArray(progress.rounds)) return value;
  return {
    ...progress,
    rounds: progress.rounds.map((value: unknown) => {
      if (typeof value !== "object" || value === null) return value;
      const round = value as Record<string, unknown>;
      if (Object.hasOwn(round, "referenceEnded")) return round;
      return {
        ...round,
        referenceEnded:
          (typeof round.completedLoops === "number" &&
            round.completedLoops > 0) ||
          round.submitted === true,
      };
    }),
  };
}

/** A corrupt record resets this day only; unavailable browser storage is reported. */
export function loadDailyProgress(
  dateKey: string,
  storage: StorageReader | null = browserStorage(),
): LoadedDailyProgress {
  const fresh = createDailyProgress(dateKey);
  if (!storage) return { progress: fresh, storageAvailable: false };
  let raw: string | null;
  try {
    raw = storage.getItem(getDailyStorageKey(dateKey));
  } catch {
    return { progress: fresh, storageAvailable: false };
  }
  if (raw === null) return { progress: fresh, storageAvailable: true };
  try {
    if (typeof raw !== "string" || raw.length > MAX_RECORD_LENGTH)
      throw new Error("Invalid saved data.");
    const parsed: unknown = migrateReferenceState(JSON.parse(raw));
    validateProgress(parsed, dateKey);
    return { progress: copyProgress(parsed), storageAvailable: true };
  } catch {
    return { progress: fresh, storageAvailable: true };
  }
}

export function saveDailyProgress(
  progress: DailyProgress,
  storage: StorageWriter | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    validateProgress(progress);
    storage.setItem(
      getDailyStorageKey(progress.dateKey),
      JSON.stringify(copyProgress(progress)),
    );
    return true;
  } catch {
    return false;
  }
}

/** Return 0–2 for the first unsubmitted round, or 3 when the day is complete. */
export function getActiveRound(progress: DailyProgress): number {
  validateProgress(progress);
  const active = progress.rounds.findIndex((round) => !round.submitted);
  return active === -1 ? 3 : active;
}

/** Scores are derived from submitted grids, never trusted from saved score fields. */
export function getTotalScore(
  progress: DailyProgress,
  puzzles: readonly Puzzle[],
): number {
  validateProgress(progress);
  if (puzzles.length !== 3)
    throw new Error("A daily challenge needs exactly three puzzles.");
  return progress.rounds.reduce(
    (total, round, index) =>
      total +
      (round.submitted
        ? scorePattern(round.pattern, puzzles[index].pattern)
        : 0),
    0,
  );
}

/** Practice uses a fresh answer and has no daily progress or play count. */
export function getPracticePuzzle(excludeId?: string): Puzzle {
  const candidates = PUZZLES.filter((puzzle) => puzzle.id !== excludeId);
  return copyPuzzle(candidates[Math.floor(Math.random() * candidates.length)]);
}
