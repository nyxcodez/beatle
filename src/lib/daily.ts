import { PUZZLES, validatePattern } from "./puzzles";
import { scorePattern } from "./scoring";
import {
  clonePattern,
  createEmptyPattern,
  LISTENING_LOOPS,
  MIN_LISTENING_LOOPS,
  TRACKS,
  type Puzzle,
  type RoundProgress,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1_000;
const FIRST_CHALLENGE_UTC = Date.UTC(2026, 0, 1);
// Keep the loop-based schema so existing saved attempts remain available.
const STORAGE_PREFIX = "beatle:daily:v2:";
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
    throw new Error("A UTC date key must use YYYY-MM-DD.");
  const timestamp = Date.parse(`${dateKey}T00:00:00.000Z`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== dateKey
  ) {
    throw new Error("Invalid UTC date key.");
  }
  return timestamp;
}

export function getUTCDateKey(date: Date = new Date()): string {
  const dateKey = date.toISOString().slice(0, 10);
  dateTimestamp(dateKey);
  return dateKey;
}

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
  const candidates = [...PUZZLES];
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [candidates[index], candidates[other]] = [
      candidates[other],
      candidates[index],
    ];
  }
  return {
    dateKey,
    number: Math.floor((timestamp - FIRST_CHALLENGE_UTC) / DAY_MS) + 1,
    puzzles: candidates.slice(0, 3).map(copyPuzzle) as [Puzzle, Puzzle, Puzzle],
  };
}

export function createDailyProgress(dateKey: string): DailyProgress {
  dateTimestamp(dateKey);
  return {
    dateKey,
    rounds: Array.from({ length: 3 }, () => ({
      pattern: createEmptyPattern(),
      completedLoops: 0,
      submitted: false,
    })),
  };
}

function isUntouched(round: RoundProgress): boolean {
  return (
    round.completedLoops === 0 &&
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
    throw new Error("Saved progress belongs to a different UTC day.");
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
      typeof round.completedLoops !== "number" ||
      !Number.isInteger(round.completedLoops) ||
      round.completedLoops < 0 ||
      round.completedLoops > LISTENING_LOOPS
    ) {
      throw new Error("Invalid round status or completed loop count.");
    }
    if (
      round.completedLoops < MIN_LISTENING_LOOPS &&
      (round.submitted ||
        TRACKS.some(({ id }) =>
          (round.pattern as RoundProgress["pattern"])[id].some(Boolean),
        ))
    ) {
      throw new Error(
        "Listen to at least one complete loop before creating an answer.",
      );
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
    const parsed: unknown = JSON.parse(raw);
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
