import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDailyProgress,
  getActiveRound,
  getDailyChallenge,
  getDailyStorageKey,
  getPracticePuzzle,
  getTotalScore,
  getUTCDateKey,
  loadDailyProgress,
  saveDailyProgress,
} from "./daily";
import { PUZZLES } from "./puzzles";
import { clonePattern } from "./types";

const DATE_KEY = "2026-10-18";

function memoryStorage() {
  const records = new Map<string, string>();
  return {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("UTC daily challenge selection", () => {
  it("uses the UTC day across local offsets and the midnight boundary", () => {
    expect(getUTCDateKey(new Date("2026-10-18T01:00:00+03:00"))).toBe(
      "2026-10-17",
    );
    expect(getUTCDateKey(new Date("2026-10-17T23:00:00-07:00"))).toBe(DATE_KEY);
    expect(getUTCDateKey(new Date("2026-10-18T23:59:59.999Z"))).toBe(DATE_KEY);
    expect(getUTCDateKey(new Date("2026-10-19T00:00:00.000Z"))).toBe(
      "2026-10-19",
    );
  });

  it("selects three distinct curated puzzles deterministically without ambient randomness", () => {
    vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("No ambient randomness");
    });
    const challenge = getDailyChallenge(DATE_KEY);
    expect(getDailyChallenge(DATE_KEY)).toEqual(challenge);
    expect(new Set(challenge.puzzles.map(({ id }) => id)).size).toBe(3);
    expect(
      challenge.puzzles.every(({ id }) =>
        PUZZLES.some((puzzle) => puzzle.id === id),
      ),
    ).toBe(true);
    expect(getDailyChallenge("2026-10-19").puzzles).not.toEqual(
      challenge.puzzles,
    );
    expect(getDailyChallenge("2026-10-19").number).toBe(challenge.number + 1);
    expect(getDailyChallenge("2026-01-01").number).toBe(1);
  });

  it("does not allow edits to a returned challenge to mutate future solutions", () => {
    const first = getDailyChallenge(DATE_KEY);
    const original = first.puzzles[0].pattern.kick[0];
    first.puzzles[0].pattern.kick[0] = !original;
    expect(getDailyChallenge(DATE_KEY).puzzles[0].pattern.kick[0]).toBe(
      original,
    );
  });

  it.each(["2026-02-30", "2026-13-01", "2026-1-01", "invalid", "__proto__"])(
    "rejects invalid date keys %s",
    (key) => {
      expect(() => getDailyChallenge(key)).toThrow();
      expect(() => createDailyProgress(key)).toThrow();
    },
  );
});

describe("daily progress persistence", () => {
  it("starts with three independent, untouched rounds", () => {
    const progress = createDailyProgress(DATE_KEY);
    expect(progress.rounds).toHaveLength(3);
    expect(getActiveRound(progress)).toBe(0);
    progress.rounds[0].pattern.kick[0] = true;
    expect(progress.rounds[1].pattern.kick[0]).toBe(false);
  });

  it("restores submitted rounds, unfinished grid edits, and exact listening time", () => {
    const storage = memoryStorage();
    const progress = createDailyProgress(DATE_KEY);
    progress.rounds[0].submitted = true;
    progress.rounds[0].listeningSecondsUsed = 30;
    progress.rounds[1].pattern.snare[4] = true;
    progress.rounds[1].listeningSecondsUsed = 12.75;
    expect(saveDailyProgress(progress, storage)).toBe(true);
    expect(loadDailyProgress(DATE_KEY, storage)).toEqual({
      progress,
      storageAvailable: true,
    });
    expect(getActiveRound(loadDailyProgress(DATE_KEY, storage).progress)).toBe(
      1,
    );
  });

  it("keeps UTC days separate and refuses stale content in the current key", () => {
    const storage = memoryStorage();
    const yesterday = createDailyProgress("2026-10-17");
    yesterday.rounds[0].submitted = true;
    saveDailyProgress(yesterday, storage);
    expect(loadDailyProgress(DATE_KEY, storage).progress).toEqual(
      createDailyProgress(DATE_KEY),
    );
    storage.setItem(getDailyStorageKey(DATE_KEY), JSON.stringify(yesterday));
    expect(loadDailyProgress(DATE_KEY, storage).progress).toEqual(
      createDailyProgress(DATE_KEY),
    );
  });

  it.each(["{", "null", "[]", "{}", "x".repeat(16_385)])(
    "recovers from malformed or oversized storage",
    (record) => {
      const storage = { getItem: () => record };
      expect(loadDailyProgress(DATE_KEY, storage)).toEqual({
        progress: createDailyProgress(DATE_KEY),
        storageAvailable: true,
      });
    },
  );

  it.each([-1, 30.01, Number.NaN, Number.POSITIVE_INFINITY, "20"])(
    "rejects invalid listening budget %s",
    (seconds) => {
      const progress = createDailyProgress(DATE_KEY);
      const malformed = {
        ...progress,
        rounds: [
          { ...progress.rounds[0], listeningSecondsUsed: seconds },
          ...progress.rounds.slice(1),
        ],
      };
      expect(
        loadDailyProgress(DATE_KEY, {
          getItem: () => JSON.stringify(malformed),
        }).progress,
      ).toEqual(progress);
    },
  );

  it("rejects out-of-order submissions, future round edits, invalid status, and invalid pattern shapes", () => {
    const invalid = [
      (progress: ReturnType<typeof createDailyProgress>) => {
        progress.rounds[1].submitted = true;
      },
      (progress: ReturnType<typeof createDailyProgress>) => {
        progress.rounds[2].pattern.kick[0] = true;
      },
      (progress: ReturnType<typeof createDailyProgress>) => {
        progress.rounds[1].listeningSecondsUsed = 1;
      },
      (progress: ReturnType<typeof createDailyProgress>) => {
        progress.rounds[0].pattern.kick = [true];
      },
      (progress: ReturnType<typeof createDailyProgress>) => {
        progress.rounds.pop();
      },
    ];
    for (const mutate of invalid) {
      const progress = createDailyProgress(DATE_KEY);
      mutate(progress);
      expect(
        loadDailyProgress(DATE_KEY, { getItem: () => JSON.stringify(progress) })
          .progress,
      ).toEqual(createDailyProgress(DATE_KEY));
      expect(saveDailyProgress(progress, memoryStorage())).toBe(false);
    }
    const malformed = createDailyProgress(DATE_KEY);
    expect(
      loadDailyProgress(DATE_KEY, {
        getItem: () =>
          JSON.stringify({
            ...malformed,
            rounds: [
              { ...malformed.rounds[0], submitted: "yes" },
              ...malformed.rounds.slice(1),
            ],
          }),
      }).progress,
    ).toEqual(malformed);
  });

  it("copies only valid schema fields rather than trusting saved totals or extra properties", () => {
    const fresh = createDailyProgress(DATE_KEY);
    const stored = JSON.stringify({
      ...fresh,
      score: 999,
      __proto__: { contaminated: true },
    });
    const loaded = loadDailyProgress(DATE_KEY, {
      getItem: () => stored,
    }).progress;
    expect(loaded).toEqual(fresh);
    expect(Object.keys(loaded)).toEqual(["dateKey", "rounds"]);
    expect(Object.getPrototypeOf(loaded)).toBe(Object.prototype);
  });

  it("handles unavailable storage, denied reads, and quota write failures", () => {
    expect(loadDailyProgress(DATE_KEY, null).storageAvailable).toBe(false);
    expect(
      loadDailyProgress(DATE_KEY, {
        getItem: () => {
          throw new Error("Denied");
        },
      }).storageAvailable,
    ).toBe(false);
    expect(saveDailyProgress(createDailyProgress(DATE_KEY), null)).toBe(false);
    expect(
      saveDailyProgress(createDailyProgress(DATE_KEY), {
        setItem: () => {
          throw new Error("Quota");
        },
      }),
    ).toBe(false);
  });
});

describe("daily totals and unlimited practice", () => {
  it("scores only submitted rounds and never exceeds the 300-point maximum", () => {
    const progress = createDailyProgress(DATE_KEY);
    const { puzzles } = getDailyChallenge(DATE_KEY);
    expect(getTotalScore(progress, puzzles)).toBe(0);
    for (let round = 0; round < 3; round += 1) {
      progress.rounds[round].pattern = clonePattern(puzzles[round].pattern);
      expect(getTotalScore(progress, puzzles)).toBe(round * 100);
      progress.rounds[round].submitted = true;
      expect(getTotalScore(progress, puzzles)).toBe((round + 1) * 100);
      expect(getActiveRound(progress)).toBe(round + 1);
    }
    expect(() => getTotalScore(progress, puzzles.slice(0, 2))).toThrow();
  });

  it("offers repeated practice without changing daily progress or immediately repeating a puzzle", () => {
    const before = createDailyProgress(DATE_KEY);
    const practice = getPracticePuzzle();
    for (let count = 0; count < 50; count += 1) {
      expect(getPracticePuzzle(practice.id).id).not.toBe(practice.id);
    }
    const source = PUZZLES.find(({ id }) => id === practice.id)!;
    const original = source.pattern.kick[0];
    practice.pattern.kick[0] = !original;
    expect(source.pattern.kick[0]).toBe(original);
    expect(createDailyProgress(DATE_KEY)).toEqual(before);
  });
});
