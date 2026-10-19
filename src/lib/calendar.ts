/** The browser's local calendar defines which daily challenge is active. */
export function getLocalDateKey(date: Date = new Date()): string {
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid local date.");
  const year = date.getFullYear();
  if (year < 0 || year > 9999) throw new Error("Unsupported calendar year.");
  return [
    String(year).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Advance the calendar, rather than adding 24 hours, to respect daylight saving. */
export function getNextLocalMidnight(now: Date = new Date()): Date {
  getLocalDateKey(now);
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight;
}

export function getLocalResetCountdown(now: Date = new Date()): string {
  const seconds = Math.max(
    0,
    Math.floor((getNextLocalMidnight(now).getTime() - now.getTime()) / 1000),
  );
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
