import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDailyProgress,
  getDailyChallenge,
  getDailyStorageKey,
  getTotalScore,
  saveDailyProgress,
} from "./daily";
import { getDailyStreak } from "./streak";

function memoryStorage() {
  const records = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => records.get(key) ?? null),
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
  };
}

function saveDay(
  storage: ReturnType<typeof memoryStorage>,
  dateKey: string,
  submittedRounds = 3,
) {
  const progress = createDailyProgress(dateKey);
  for (const round of progress.rounds.slice(0, submittedRounds)) {
    round.referenceEnded = true;
    round.submitted = true;
  }
  expect(saveDailyProgress(progress, storage)).toBe(true);
  return progress;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("daily streak", () => {
  it("starts at zero and does not count partially submitted days", () => {
    const storage = memoryStorage();
    expect(getDailyStreak("2026-10-19", false, storage)).toBe(0);
    saveDay(storage, "2026-10-18", 2);
    saveDay(storage, "2026-10-19", 1);
    expect(getDailyStreak("2026-10-19", false, storage)).toBe(0);
  });

  it("counts completing all three rounds even with a score of zero", () => {
    const storage = memoryStorage();
    const progress = saveDay(storage, "2026-10-18");
    expect(
      getTotalScore(progress, getDailyChallenge("2026-10-18").puzzles),
    ).toBe(0);
    expect(getDailyStreak("2026-10-19", false, storage)).toBe(1);
  });

  it("backfills consecutive saved days and preserves the streak while today is pending", () => {
    const storage = memoryStorage();
    saveDay(storage, "2026-10-16");
    saveDay(storage, "2026-10-17");
    saveDay(storage, "2026-10-18");
    saveDay(storage, "2026-10-19", 2);
    expect(getDailyStreak("2026-10-19", false, storage)).toBe(3);
  });

  it("increments exactly once when today is completed, including after reload", () => {
    const storage = memoryStorage();
    saveDay(storage, "2026-10-17");
    saveDay(storage, "2026-10-18");
    expect(getDailyStreak("2026-10-19", false, storage)).toBe(2);
    expect(getDailyStreak("2026-10-19", true, storage)).toBe(3);
    saveDay(storage, "2026-10-19");
    expect(getDailyStreak("2026-10-19", true, storage)).toBe(3);
    expect(getDailyStreak("2026-10-19", true, storage)).toBe(3);
    expect(getDailyStreak("2026-10-20", false, storage)).toBe(3);
  });

  it("resets after a missed day and starts again when today is completed", () => {
    const storage = memoryStorage();
    saveDay(storage, "2026-10-17");
    expect(getDailyStreak("2026-10-19", false, storage)).toBe(0);
    expect(getDailyStreak("2026-10-19", true, storage)).toBe(1);
  });

  it("stops at an incomplete historical day without skipping it", () => {
    const storage = memoryStorage();
    saveDay(storage, "2026-10-16");
    saveDay(storage, "2026-10-17", 2);
    saveDay(storage, "2026-10-18");
    expect(getDailyStreak("2026-10-19", true, storage)).toBe(2);
  });

  it.each(["{", "null", "{}", "x".repeat(16_385)])(
    "stops at corrupt historical progress",
    (record) => {
      const storage = memoryStorage();
      saveDay(storage, "2026-10-16");
      storage.setItem(getDailyStorageKey("2026-10-17"), record);
      saveDay(storage, "2026-10-18");
      expect(getDailyStreak("2026-10-19", true, storage)).toBe(2);
    },
  );

  it("rejects a historical record stored under another day's key", () => {
    const storage = memoryStorage();
    const progress = saveDay(storage, "2026-10-17");
    storage.setItem(getDailyStorageKey("2026-10-18"), JSON.stringify(progress));
    expect(getDailyStreak("2026-10-19", false, storage)).toBe(0);
  });

  it("ignores legacy UTC namespaces and future records", () => {
    const storage = memoryStorage();
    const previous = saveDay(storage, "2026-10-17");
    const today = saveDay(storage, "2026-10-19");
    saveDay(storage, "2026-10-20");
    storage.setItem("beatle:daily:v2:2026-10-18", JSON.stringify(previous));
    storage.setItem("beatle:daily:v1:2026-10-18", JSON.stringify(today));
    expect(getDailyStreak("2026-10-19", false, storage)).toBe(0);
    expect(storage.getItem.mock.calls).toEqual([
      [getDailyStorageKey("2026-10-18")],
    ]);
  });

  it("keeps today's completion when storage is absent or throws", () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error("Storage blocked");
      },
    };
    for (const storage of [null, throwingStorage]) {
      expect(getDailyStreak("2026-10-19", false, storage)).toBe(0);
      expect(getDailyStreak("2026-10-19", true, storage)).toBe(1);
    }
  });

  it("keeps already counted days when reading older history fails", () => {
    const storage = memoryStorage();
    saveDay(storage, "2026-10-18");
    const reader = {
      getItem: (key: string) => {
        if (key === getDailyStorageKey("2026-10-17"))
          throw new Error("Blocked");
        return storage.getItem(key);
      },
    };
    expect(getDailyStreak("2026-10-19", true, reader)).toBe(2);
  });

  it("uses browser storage safely by default", () => {
    const storage = memoryStorage();
    saveDay(storage, "2026-10-18");
    vi.stubGlobal("localStorage", storage);
    expect(getDailyStreak("2026-10-19", false)).toBe(1);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("Storage access denied");
      },
    });
    expect(getDailyStreak("2026-10-19", true)).toBe(1);
  });

  it.each([
    ["2027-01-01", "2026-12-31", "2026-12-30"],
    ["2026-03-01", "2026-02-28", "2026-02-27"],
    ["2028-03-01", "2028-02-29", "2028-02-28"],
    ["2026-03-30", "2026-03-29", "2026-03-28"],
    ["2026-10-26", "2026-10-25", "2026-10-24"],
  ])(
    "uses adjacent calendar labels across the boundary at %s",
    (today, yesterday, before) => {
      const storage = memoryStorage();
      saveDay(storage, before);
      saveDay(storage, yesterday);
      expect(getDailyStreak(today, false, storage)).toBe(2);
      expect(getDailyStreak(today, true, storage)).toBe(3);
    },
  );

  it("handles the first supported calendar date without reading an invalid year", () => {
    const storage = memoryStorage();
    expect(getDailyStreak("0000-01-01", true, storage)).toBe(1);
    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it.each(["2026-02-30", "2026-13-01", "2026-1-01", "invalid", "__proto__"])(
    "rejects invalid date key %s even when storage is unavailable",
    (dateKey) => {
      expect(() => getDailyStreak(dateKey, true, null)).toThrow();
    },
  );
});
