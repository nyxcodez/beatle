import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getLocalDateKey,
  loadDailyProgress,
  saveDailyProgress,
  type DailyProgress,
} from "./daily";
import type { RoundProgress } from "./types";
import { getDailyStreak } from "./streak";

/** Keep date rollover and best-effort browser persistence out of the game UI. */
export function useDailyGame(onNewDay: () => void) {
  const [loaded] = useState(() => loadDailyProgress(getLocalDateKey()));
  const [daily, setDaily] = useState(loaded.progress);
  const [storageAvailable, setStorageAvailable] = useState(
    loaded.storageAvailable,
  );
  const dailyRef = useRef(daily);
  const onNewDayRef = useRef(onNewDay);
  onNewDayRef.current = onNewDay;
  const completedToday = daily.rounds.every((round) => round.submitted);
  const streak = useMemo(
    () => getDailyStreak(daily.dateKey, completedToday),
    [daily.dateKey, completedToday],
  );

  const updateRound = useCallback(
    (index: number, round: RoundProgress, dateKey: string) => {
      const current = dailyRef.current;
      if (dateKey !== current.dateKey) return;
      // A submitted round is final, including when reviewing a previous round.
      if (current.rounds[index].submitted) return;
      const next: DailyProgress = {
        ...current,
        rounds: current.rounds.map((existing, i) =>
          i === index ? round : existing,
        ),
      };
      dailyRef.current = next;
      setDaily(next);
      setStorageAvailable(saveDailyProgress(next));
    },
    [],
  );

  useEffect(() => {
    function checkDate() {
      const dateKey = getLocalDateKey();
      if (dateKey === dailyRef.current.dateKey) return;
      const next = loadDailyProgress(dateKey);
      dailyRef.current = next.progress;
      setDaily(next.progress);
      setStorageAvailable(next.storageAvailable);
      onNewDayRef.current();
    }
    const interval = window.setInterval(checkDate, 1000);
    window.addEventListener("focus", checkDate);
    document.addEventListener("visibilitychange", checkDate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", checkDate);
      document.removeEventListener("visibilitychange", checkDate);
    };
  }, []);

  return { daily, updateRound, storageAvailable, streak };
}
