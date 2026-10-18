import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Asterisk,
  AudioLines,
  Check,
  CircleHelp,
  Headphones,
  Infinity,
  Sparkles,
} from "lucide-react";
import DailySummary from "./components/DailySummary";
import HelpDialog from "./components/HelpDialog";
import RoundBoard from "./components/RoundBoard";
import {
  getActiveRound,
  getDailyChallenge,
  getPracticePuzzle,
  getTotalScore,
} from "./lib/daily";
import { scorePattern } from "./lib/scoring";
import { createEmptyPattern, type RoundProgress } from "./lib/types";
import { useDailyGame } from "./lib/useDailyGame";

type Mode = "daily" | "practice";
const freshRound = (): RoundProgress => ({
  pattern: createEmptyPattern(),
  completedLoops: 0,
  submitted: false,
});

export default function App() {
  const [mode, setMode] = useState<Mode>("daily");
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [summaryVisible, setSummaryVisible] = useState<boolean | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [newDayMessage, setNewDayMessage] = useState(false);
  const gameRef = useRef<HTMLDivElement>(null);
  const newDay = useCallback(() => {
    setSelectedRound(null);
    setSummaryVisible(null);
    setNewDayMessage(true);
  }, []);
  const { daily, updateRound, storageAvailable } = useDailyGame(newDay);
  const [practice, setPractice] = useState(() => ({
    puzzle: getPracticePuzzle(),
    progress: freshRound(),
    roundNumber: 1,
  }));
  const challenge = getDailyChallenge(daily.dateKey);
  const activeRound = getActiveRound(daily);
  const roundIndex = selectedRound ?? Math.min(activeRound, 2);
  const showSummary = mode === "daily" && (summaryVisible ?? activeRound === 3);
  const currentProgress =
    mode === "daily" ? daily.rounds[roundIndex] : practice.progress;
  const currentPuzzle =
    mode === "daily" ? challenge.puzzles[roundIndex] : practice.puzzle;
  const total = getTotalScore(daily, challenge.puzzles);
  const prettyDate = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${daily.dateKey}T00:00:00Z`));

  useEffect(() => {
    if (!newDayMessage) return;
    const timeout = window.setTimeout(() => setNewDayMessage(false), 8000);
    return () => window.clearTimeout(timeout);
  }, [newDayMessage]);

  function scrollToGame() {
    window.requestAnimationFrame(() => {
      gameRef.current?.focus({ preventScroll: true });
      if (window.innerWidth < 650)
        gameRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
          block: "start",
        });
    });
  }

  function switchMode(next: Mode) {
    setMode(next);
  }

  function updateProgress(next: RoundProgress) {
    if (mode === "daily") updateRound(roundIndex, next, daily.dateKey);
    else setPractice((previous) => ({ ...previous, progress: next }));
  }

  function submitProgress(next: RoundProgress) {
    if (mode === "daily") {
      setSelectedRound(roundIndex);
      setSummaryVisible(false);
    }
    updateProgress(next);
  }

  function nextRound() {
    if (mode === "practice")
      setPractice((previous) => ({
        puzzle: getPracticePuzzle(previous.puzzle.id),
        progress: freshRound(),
        roundNumber: previous.roundNumber + 1,
      }));
    else if (roundIndex < 2) setSelectedRound(roundIndex + 1);
    else setSummaryVisible(true);
    scrollToGame();
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#game">
        Skip to the beat
      </a>
      <header className="site-header">
        <a href="/" className="brand" aria-label="Beatle home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          beatle<span className="brand-dot">.</span>
        </a>
        <nav className="mode-nav" aria-label="Game mode">
          <button
            className={mode === "daily" ? "active" : ""}
            aria-pressed={mode === "daily"}
            onClick={() => switchMode("daily")}
          >
            Daily beat
            <span className="nav-dot" />
          </button>
          <button
            className={mode === "practice" ? "active" : ""}
            aria-pressed={mode === "practice"}
            onClick={() => switchMode("practice")}
          >
            Practice
            <ArrowUpRight size={12} />
          </button>
        </nav>
        <button
          className="header-help"
          aria-label="How to play"
          onClick={() => setShowHelp(true)}
        >
          <CircleHelp size={19} />
          <span>How to play</span>
        </button>
      </header>

      <main className="main-content">
        <div className="hero">
          <div>
            <p className="eyebrow hero-eyebrow">
              <span />
              {mode === "daily"
                ? "A LITTLE RHYTHM. A DAILY RITUAL."
                : "NO LIMITS. JUST GOOD VIBRATIONS."}
            </p>
            <h1>
              Find your <span>rhythm.</span>
            </h1>
            <p className="hero-description">
              {mode === "daily"
                ? "A beat worth listening to. A puzzle worth coming back for."
                : "More time in the pocket. A fresh groove whenever you want."}
            </p>
          </div>
          <div className="hero-note">
            <Headphones size={18} />
            <p>
              Made for your ears.
              <br />
              <strong>And your inner drummer.</strong>
              <span className="challenge-date">
                {mode === "daily"
                  ? `DAILY #${challenge.number} · ${prettyDate.toUpperCase()} · UTC`
                  : "PRACTICE MAKES POCKET."}
              </span>
            </p>
            <Asterisk className="note-spark" size={40} strokeWidth={1.5} />
          </div>
        </div>

        {newDayMessage && (
          <p className="notice-banner" role="status">
            A new day, a new groove. Your next UTC daily challenge is ready.
          </p>
        )}
        {!storageAvailable && (
          <p className="notice-banner" role="status">
            Browser storage is unavailable. You can still play, but your daily
            progress may not survive a refresh.
          </p>
        )}

        <div className="challenge-status">
          {mode === "daily" ? (
            <div className="round-tabs" aria-label="Daily rounds">
              {daily.rounds.map((round, index) => (
                <button
                  key={index}
                  className={`round-tab ${index === roundIndex && !showSummary ? "active" : ""} ${round.submitted ? "complete" : ""}`}
                  disabled={index > Math.min(activeRound, 2)}
                  aria-label={`Round ${index + 1}${round.submitted ? ", complete" : index > activeRound ? ", locked" : ", current"}`}
                  aria-current={
                    index === roundIndex && !showSummary ? "step" : undefined
                  }
                  onClick={() => {
                    setSelectedRound(index);
                    setSummaryVisible(false);
                  }}
                >
                  <span>
                    {round.submitted ? <Check size={11} /> : index + 1}
                  </span>
                  Round {String(index + 1).padStart(2, "0")}
                </button>
              ))}
            </div>
          ) : (
            <div className="practice-tag">
              <Infinity size={16} />
              <span>THE PRACTICE ROOM</span>
              <small>Unlimited rounds</small>
            </div>
          )}
          <p className="total-score">
            {mode === "daily" ? "YOUR SCORE" : "ROUND SCORE"}
            <strong>
              {mode === "daily"
                ? total
                : practice.progress.submitted
                  ? scorePattern(
                      practice.progress.pattern,
                      practice.puzzle.pattern,
                    )
                  : "—"}
              <span>/ {mode === "daily" ? "300" : "100"}</span>
            </strong>
          </p>
        </div>

        <div id="game" className="game-container" ref={gameRef} tabIndex={-1}>
          {showSummary ? (
            <DailySummary
              challengeNumber={challenge.number}
              progress={daily}
              puzzles={challenge.puzzles}
              onPractice={() => {
                switchMode("practice");
                scrollToGame();
              }}
              onReview={() => {
                setSummaryVisible(false);
                setSelectedRound(0);
                scrollToGame();
              }}
            />
          ) : (
            <RoundBoard
              key={
                mode === "daily"
                  ? `daily:${daily.dateKey}:${roundIndex}`
                  : `practice:${practice.roundNumber}:${practice.puzzle.id}`
              }
              puzzle={currentPuzzle}
              roundNumber={
                mode === "daily" ? roundIndex + 1 : practice.roundNumber
              }
              progress={currentProgress}
              onChange={updateProgress}
              onSubmit={submitProgress}
              onNext={nextRound}
              nextLabel={
                mode === "practice"
                  ? "Another groove"
                  : roundIndex === 2
                    ? "See daily results"
                    : "Next round"
              }
              onHelp={() => setShowHelp(true)}
              suspendPlayback={showHelp}
            />
          )}
        </div>

        <div className="how-it-works">
          <div>
            <span className="tip-icon">
              <Headphones size={18} />
            </span>
            <p>
              <strong>Listen in.</strong>
              <span>Six loops to catch the groove.</span>
            </p>
          </div>
          <div>
            <span className="tip-icon">
              <AudioLines size={18} />
            </span>
            <p>
              <strong>Tap it out.</strong>
              <span>Three sounds. Sixteen steps. Your call.</span>
            </p>
          </div>
          <div>
            <span className="tip-icon">
              <Sparkles size={18} />
            </span>
            <p>
              <strong>Find your flow.</strong>
              <span>
                {mode === "daily"
                  ? "Three rounds. A fresh beat every day."
                  : "No daily limit. Just one more groove."}
              </span>
            </p>
          </div>
        </div>
      </main>
      <footer className="site-footer">
        <p>
          A daily dose of <span>good vibrations.</span>
        </p>
        <span>NO PERFECT PITCH REQUIRED.</span>
      </footer>
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
    </div>
  );
}
