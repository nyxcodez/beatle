import { getActiveRound, getDailyStorageKey, loadDailyProgress } from "./daily";

type StorageReader = Pick<Storage, "getItem">;

function browserStorage(): StorageReader | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Calendar labels use UTC arithmetic so a 23- or 25-hour local day stays adjacent. */
function previousDateKey(dateKey: string): string | null {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.getUTCFullYear() < 0 ? null : date.toISOString().slice(0, 10);
}

/**
 * Count completed local days, keeping yesterday's streak while today is pending.
 * Today's live completion also counts when browser storage cannot be written.
 */
export function getDailyStreak(
  dateKey: string,
  completedToday: boolean,
  storage: StorageReader | null = browserStorage(),
): number {
  getDailyStorageKey(dateKey);
  let streak = completedToday ? 1 : 0;
  if (!storage) return streak;

  let previous = previousDateKey(dateKey);
  while (previous !== null) {
    const { progress, storageAvailable } = loadDailyProgress(previous, storage);
    if (!storageAvailable || getActiveRound(progress) !== 3) break;
    streak += 1;
    previous = previousDateKey(previous);
  }
  return streak;
}
