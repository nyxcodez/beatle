import { describe, expect, it } from "vitest";
import {
  getLocalDateKey,
  getLocalResetCountdown,
  getNextLocalMidnight,
} from "./calendar";

describe("local calendar reset", () => {
  it("pads local date components and handles year rollover", () => {
    expect(getLocalDateKey(new Date(2026, 0, 2, 1))).toBe("2026-01-02");
    const now = new Date(2026, 11, 31, 23, 59, 50);
    expect(getLocalDateKey(now)).toBe("2026-12-31");
    expect(getLocalDateKey(getNextLocalMidnight(now))).toBe("2027-01-01");
    expect(getLocalResetCountdown(now)).toBe("00:00:10");
  });

  it("advances to calendar midnight without changing the input", () => {
    const now = new Date(2026, 9, 18, 20, 30, 15);
    const original = now.getTime();
    const next = getNextLocalMidnight(now);
    expect([
      next.getFullYear(),
      next.getMonth(),
      next.getDate(),
      next.getHours(),
      next.getMinutes(),
      next.getSeconds(),
    ]).toEqual([2026, 9, 19, 0, 0, 0]);
    expect(getLocalResetCountdown(now)).toBe("03:29:45");
    expect(now.getTime()).toBe(original);
  });

  it("rejects invalid dates instead of rendering a broken countdown", () => {
    expect(() => getLocalDateKey(new Date(NaN))).toThrow();
    expect(() => getNextLocalMidnight(new Date(NaN))).toThrow();
    expect(() => getLocalResetCountdown(new Date(NaN))).toThrow();
  });
});
