import { Check, Flame } from "lucide-react";

interface Props {
  days: number;
  completedToday: boolean;
}

export default function DailyStreak({ days, completedToday }: Props) {
  return (
    <div
      className="daily-streak"
      role="status"
      aria-label="Daily streak"
      data-completed={completedToday}
    >
      <span className="streak-icon" aria-hidden="true">
        <Flame size={21} />
      </span>
      <div className="streak-total">
        <span className="streak-label">DAILY STREAK</span>
        <strong>
          <span className="streak-count">{days}</span>{" "}
          {days === 1 ? "day" : "days"}
        </strong>
      </div>
      <p className="streak-message">
        {completedToday ? (
          <>
            <Check size={15} aria-hidden="true" />
            Today complete. Come back tomorrow to keep it going.
          </>
        ) : days > 0 ? (
          "Finish today’s three rounds to keep your streak going."
        ) : (
          "Finish all three daily rounds to start your streak."
        )}
      </p>
    </div>
  );
}
