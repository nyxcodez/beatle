export const STEP_COUNT = 16;
export const LISTENING_LOOPS = 6;

export type TrackId = "kick" | "snare" | "hihat";

export interface Track {
  id: TrackId;
  label: string;
  shortLabel: string;
  color: string;
}

export const TRACKS: readonly Track[] = [
  { id: "kick", label: "Kick", shortLabel: "K", color: "#ff7a6b" },
  { id: "snare", label: "Snare", shortLabel: "S", color: "#62dce8" },
  { id: "hihat", label: "Hi-hat", shortLabel: "H", color: "#e9c46a" },
];

export type RhythmPattern = Record<TrackId, boolean[]>;

export interface Puzzle {
  id: string;
  title: string;
  bpm: number;
  pattern: RhythmPattern;
}

export interface RoundProgress {
  pattern: RhythmPattern;
  completedLoops: number;
  submitted: boolean;
}

/** Each answer needs its own arrays so editing one round cannot mutate another. */
export function createEmptyPattern(): RhythmPattern {
  return {
    kick: Array<boolean>(STEP_COUNT).fill(false),
    snare: Array<boolean>(STEP_COUNT).fill(false),
    hihat: Array<boolean>(STEP_COUNT).fill(false),
  };
}

export function clonePattern(pattern: RhythmPattern): RhythmPattern {
  return {
    kick: [...pattern.kick],
    snare: [...pattern.snare],
    hihat: [...pattern.hihat],
  };
}
