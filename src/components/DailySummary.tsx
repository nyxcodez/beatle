import { useEffect, useState } from "react";
import { ArrowRight, Check, Copy, PartyPopper, RotateCcw } from "lucide-react";
import { getTotalScore, type DailyProgress } from "../lib/daily";
import { scorePattern } from "../lib/scoring";
import type { Puzzle } from "../lib/types";

interface Props {
  challengeNumber: number;
  progress: DailyProgress;
  puzzles: readonly Puzzle[];
  onPractice: () => void;
  onReview: () => void;
}

function untilNextUTC(): string {
  const now = new Date();
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  const seconds = Math.max(0, Math.floor((midnight - now.getTime()) / 1000));
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export default function DailySummary({
  challengeNumber,
  progress,
  puzzles,
  onPractice,
  onReview,
}: Props) {
  const [countdown, setCountdown] = useState(untilNextUTC);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const total = getTotalScore(progress, puzzles);
  const scores = progress.rounds.map((round, index) =>
    scorePattern(round.pattern, puzzles[index].pattern),
  );
  const shareText = `Beatle #${challengeNumber} · ${progress.dateKey}\n${scores.map((score) => `${score === 100 ? "🟩" : score >= 80 ? "🟨" : "🟧"} ${score}%`).join("  ")}\n${total}/300 · Find your rhythm.`;

  useEffect(() => {
    const timer = window.setInterval(() => setCountdown(untilNextUTC()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function copyResults() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <section className="daily-summary" aria-labelledby="summary-title">
      <span className="summary-icon">
        <PartyPopper size={30} strokeWidth={1.4} />
      </span>
      <p className="eyebrow">THREE ROUNDS. ONE GOOD RITUAL.</p>
      <h2 id="summary-title">
        {total === 300
          ? "Perfectly in the pocket."
          : total >= 240
            ? "You’ve got the groove."
            : "That’s your kind of rhythm."}
      </h2>
      <p className="summary-description">
        Today’s beat is in the books. Same time tomorrow?
      </p>
      <div className="summary-total">
        <strong>{total}</strong>
        <span>/ 300</span>
      </div>
      <p className="eyebrow">YOUR DAILY SCORE</p>
      <div className="summary-rounds">
        {scores.map((score, index) => (
          <div key={puzzles[index].id}>
            <span>ROUND {String(index + 1).padStart(2, "0")}</span>
            <strong>
              {score}
              <small>%</small>
            </strong>
            <p>{puzzles[index].title}</p>
          </div>
        ))}
      </div>
      <div className="summary-actions">
        <button className="secondary-button" onClick={() => void copyResults()}>
          {copyStatus === "copied" ? <Check size={15} /> : <Copy size={15} />}
          {copyStatus === "copied" ? "Results copied" : "Copy results"}
        </button>
        <button className="primary-button" onClick={onPractice}>
          Keep the beat going
          <ArrowRight size={16} />
        </button>
      </div>
      {copyStatus === "failed" && (
        <div className="share-fallback" role="status">
          <p>Copy isn’t available here. Select and copy your results:</p>
          <textarea
            aria-label="Your shareable results"
            value={shareText}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
      <div className="next-beat">
        <p>YOUR NEXT DAILY BEAT IN</p>
        <strong>{countdown}</strong>
        <span>Resets at 00:00 UTC</span>
      </div>
      <button className="text-button review-button" onClick={onReview}>
        <RotateCcw size={13} />
        Review today’s rounds
      </button>
    </section>
  );
}
