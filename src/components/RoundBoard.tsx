import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  ArrowRight,
  AudioLines,
  CheckCheck,
  CircleHelp,
  Headphones,
  LockKeyhole,
  LoaderCircle,
  Play,
  RotateCcw,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { BeatleAudioEngine } from "../audio/BeatleAudioEngine";
import { getScoreDetails } from "../lib/scoring";
import {
  createEmptyPattern,
  LISTENING_LOOPS,
  STEP_COUNT,
  TRACKS,
  type Puzzle,
  type RoundProgress,
  type TrackId,
} from "../lib/types";

interface Props {
  puzzle: Puzzle;
  roundNumber: number;
  progress: RoundProgress;
  onChange: (progress: RoundProgress) => void;
  onSubmit: (progress: RoundProgress) => void;
  onNext?: () => void;
  nextLabel?: string;
  onHelp: () => void;
  suspendPlayback?: boolean;
}

type Playback = "target" | "answer" | null;

const WAVE_HEIGHTS = [
  12, 21, 30, 18, 35, 46, 27, 16, 24, 40, 51, 31, 19, 28, 43, 34, 17, 25, 38,
  52, 29, 18, 32, 44, 23, 15, 29, 41, 53, 33, 21, 37, 47, 28, 16, 26, 39, 30,
  18, 33, 45, 25, 14, 28, 39, 22, 15, 10,
];

export default function RoundBoard({
  puzzle,
  roundNumber,
  progress,
  onChange,
  onSubmit,
  onNext,
  nextLabel = "Next round",
  onHelp,
  suspendPlayback = false,
}: Props) {
  const engineRef = useRef<BeatleAudioEngine | null>(null);
  const progressRef = useRef(progress);
  const onChangeRef = useRef(onChange);
  const playbackRef = useRef<Playback>(null);
  const requestRef = useRef(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [playback, setPlayback] = useState<Playback>(null);
  const [countIn, setCountIn] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [focusedCell, setFocusedCell] = useState(0);
  const [resultView, setResultView] = useState<"solution" | "answer">(
    "solution",
  );
  const [clearConfirmation, setClearConfirmation] = useState(false);

  progressRef.current = progress;
  onChangeRef.current = onChange;

  function updateCompletedLoops(completedLoops: number) {
    if (progressRef.current.submitted) return;
    const next = {
      ...progressRef.current,
      completedLoops: Math.min(LISTENING_LOOPS, completedLoops),
    };
    progressRef.current = next;
    onChangeRef.current(next);
  }

  function stopPlayback() {
    requestRef.current += 1;
    playbackRef.current = null;
    engineRef.current?.stop();
    setPlayback(null);
    setCountIn(null);
    setCurrentStep(-1);
    setLoading(false);
  }

  useEffect(() => {
    const engine = new BeatleAudioEngine();
    engineRef.current = engine;
    const onVisibility = () => {
      if (document.hidden) stopPlayback();
    };
    const onPageHide = () => stopPlayback();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      requestRef.current += 1;
      playbackRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (suspendPlayback) stopPlayback();
  }, [suspendPlayback]);

  useEffect(() => {
    if (progress.submitted) resultRef.current?.focus({ preventScroll: true });
  }, [progress.submitted]);

  async function play(mode: Exclude<Playback, null>) {
    if (playbackRef.current === mode) {
      stopPlayback();
      return;
    }
    stopPlayback();
    const startingLoops = progressRef.current.completedLoops;
    const remaining = LISTENING_LOOPS - startingLoops;
    if (mode === "target" && !progressRef.current.submitted && remaining <= 0)
      return;
    if (mode === "answer" && startingLoops < LISTENING_LOOPS) return;
    const request = ++requestRef.current;
    setLoading(true);
    setAudioError("");
    playbackRef.current = mode;
    setPlayback(mode);
    try {
      await engineRef.current?.play(
        mode === "target" ? puzzle.pattern : progressRef.current.pattern,
        puzzle.bpm,
        {
          countIn: mode === "target",
          maxLoops:
            mode === "target" && !progressRef.current.submitted
              ? remaining
              : undefined,
          onStep: (step) => {
            if (request === requestRef.current) setCurrentStep(step);
          },
          onCountIn: (beat) => {
            if (request !== requestRef.current) return;
            setCountIn(beat);
            setLoading(false);
          },
          onLoopComplete: (completed) => {
            if (request !== requestRef.current || mode !== "target") return;
            updateCompletedLoops(startingLoops + completed);
          },
          onComplete: () => {
            if (request !== requestRef.current) return;
            updateCompletedLoops(LISTENING_LOOPS);
            playbackRef.current = null;
            setPlayback(null);
            setCountIn(null);
            setCurrentStep(-1);
          },
        },
      );
      if (request === requestRef.current) setLoading(false);
    } catch {
      if (request !== requestRef.current) return;
      stopPlayback();
      setAudioError(
        "Audio couldn’t start. Check your sound settings and try again.",
      );
    }
  }

  async function previewInstrument(track: TrackId) {
    if (playbackRef.current) return;
    try {
      await engineRef.current?.preview(track);
      setAudioError("");
    } catch {
      setAudioError(
        "Audio couldn’t start. Check your sound settings and try again.",
      );
    }
  }

  function toggleCell(track: TrackId, step: number) {
    if (
      progressRef.current.submitted ||
      progressRef.current.completedLoops < LISTENING_LOOPS
    )
      return;
    if (playbackRef.current === "answer") stopPlayback();
    const nextPattern = {
      ...progressRef.current.pattern,
      [track]: [...progressRef.current.pattern[track]],
    };
    nextPattern[track][step] = !nextPattern[track][step];
    const next = { ...progressRef.current, pattern: nextPattern };
    progressRef.current = next;
    onChangeRef.current(next);
    if (nextPattern[track][step]) void previewInstrument(track);
    setClearConfirmation(false);
  }

  function navigateGrid(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const directions: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: STEP_COUNT,
      ArrowUp: -STEP_COUNT,
    };
    let next = index;
    if (event.key in directions)
      next =
        (index + directions[event.key] + STEP_COUNT * 3) % (STEP_COUNT * 3);
    else if (event.key === "Home")
      next = Math.floor(index / STEP_COUNT) * STEP_COUNT;
    else if (event.key === "End")
      next = Math.floor(index / STEP_COUNT) * STEP_COUNT + STEP_COUNT - 1;
    else return;
    event.preventDefault();
    setFocusedCell(next);
    const pad = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-cell="${next}"]`,
    );
    const scroller = gridRef.current?.parentElement;
    pad?.focus({ preventScroll: true });
    // Browser focus scrolling does not account for the sticky instrument column.
    // Keep the whole focused pad visible, including when moving left on mobile.
    if (pad && scroller) {
      const bounds = scroller.getBoundingClientRect();
      const instrument = gridRef.current
        ?.querySelector<HTMLElement>(".instrument-button")
        ?.getBoundingClientRect();
      const cell = pad.getBoundingClientRect();
      const visibleLeft =
        Math.max(bounds.left, instrument?.right ?? bounds.left) + 8;
      const visibleRight = bounds.right - 6;
      if (cell.left < visibleLeft)
        scroller.scrollLeft += cell.left - visibleLeft;
      else if (cell.right > visibleRight)
        scroller.scrollLeft += cell.right - visibleRight;
    }
  }

  function submit() {
    if (
      progressRef.current.submitted ||
      progressRef.current.completedLoops < LISTENING_LOOPS
    )
      return;
    stopPlayback();
    const submitted = { ...progressRef.current, submitted: true };
    progressRef.current = submitted;
    onSubmit(submitted);
    setResultView("solution");
  }

  const listeningComplete = progress.completedLoops >= LISTENING_LOOPS;
  const gridLocked = !listeningComplete;
  const details = progress.submitted
    ? getScoreDetails(progress.pattern, puzzle.pattern)
    : null;
  const displayPattern =
    progress.submitted && resultView === "solution"
      ? puzzle.pattern
      : progress.pattern;
  const hasNotes = TRACKS.some(({ id }) => progress.pattern[id].some(Boolean));

  return (
    <section className="round-board" aria-label={`Round ${roundNumber}`}>
      <div className="board-heading flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="round-number">
            {String(roundNumber).padStart(2, "0")}
          </span>
          <div>
            <p className="eyebrow">
              {progress.submitted ? "ROUND COMPLETE" : "THE CHALLENGE"}
            </p>
            <h2>
              {progress.submitted ? puzzle.title : "Listen. Feel. Recreate."}
            </h2>
          </div>
        </div>
        <div className="tempo-pill">
          <span className="tempo-dot" />
          <strong>{puzzle.bpm}</strong> BPM
          <span className="tempo-divider" />
          <span className="time-signature">4/4</span>
        </div>
      </div>

      <div
        className={`listen-panel ${playback === "target" ? "is-playing" : ""}`}
      >
        <button
          className="listen-button"
          onClick={() => void play("target")}
          disabled={!progress.submitted && listeningComplete}
          aria-label={
            playback === "target"
              ? "Stop listening"
              : progress.submitted
                ? "Play the solution"
                : "Listen to the beat"
          }
        >
          {loading && playback === "target" ? (
            <LoaderCircle className="spin" size={24} />
          ) : playback === "target" ? (
            <Square size={21} fill="currentColor" />
          ) : (
            <Play size={25} fill="currentColor" />
          )}
        </button>
        <div className="listen-copy">
          <h3>
            {playback === "target" && countIn !== null
              ? `Get ready… ${countIn}`
              : playback === "target"
                ? "Find the groove."
                : progress.submitted
                  ? "The original beat"
                  : listeningComplete
                    ? "Now, trust your ears."
                    : "First, catch the beat."}
          </h3>
          <p>
            {progress.submitted
              ? "Listen again and compare your rhythm."
              : listeningComplete
                ? "Six loops heard. The grid is yours—take your time."
                : playback === "target" && countIn === null && !loading
                  ? `Loop ${Math.min(LISTENING_LOOPS, progress.completedLoops + 1)} of ${LISTENING_LOOPS}. Just listen for now.`
                  : "Hear the loop six times, then recreate it from memory."}
          </p>
        </div>
        <div
          className={`waveform ${playback === "target" && countIn === null ? "waveform-active" : ""}`}
          aria-hidden="true"
        >
          {WAVE_HEIGHTS.map((height, i) => (
            <span
              key={i}
              style={
                {
                  "--height": `${height}px`,
                  "--delay": `${i * 24}ms`,
                } as CSSProperties
              }
              className={
                currentStep >= 0 && Math.floor(i / 3) === currentStep
                  ? "wave-current"
                  : ""
              }
            />
          ))}
        </div>
        <div className="listening-clock">
          {progress.submitted ? (
            <span className="unlimited-label">
              <Headphones size={15} /> REPLAY ANYTIME
            </span>
          ) : (
            <>
              <span className="clock-time">
                <span>{progress.completedLoops}</span>
                <span className="clock-total"> / {LISTENING_LOOPS}</span>
              </span>
              <span className="clock-label">LOOPS COMPLETED</span>
            </>
          )}
        </div>
        {!progress.submitted && (
          <div
            className="listening-progress"
            role="progressbar"
            aria-label="Loops completed"
            aria-valuemin={0}
            aria-valuemax={LISTENING_LOOPS}
            aria-valuenow={progress.completedLoops}
            aria-valuetext={`${progress.completedLoops} of ${LISTENING_LOOPS} loops completed`}
          >
            <span
              style={{
                width: `${(progress.completedLoops / LISTENING_LOOPS) * 100}%`,
              }}
            />
          </div>
        )}
      </div>

      {audioError && (
        <p className="audio-error" role="alert">
          {audioError}
        </p>
      )}

      <div className="sequence-heading flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AudioLines size={15} />
          <h3 className="eyebrow">
            {progress.submitted ? "THE BREAKDOWN" : "YOUR SEQUENCE"}
          </h3>
        </div>
        {progress.submitted ? (
          <div className="result-tabs" aria-label="Compare rhythms">
            <button
              onClick={() => setResultView("solution")}
              aria-pressed={resultView === "solution"}
            >
              The solution
            </button>
            <button
              onClick={() => setResultView("answer")}
              aria-pressed={resultView === "answer"}
            >
              Your beat
            </button>
          </div>
        ) : (
          <span className="sequence-meta">
            3 instruments<span>·</span>16 steps
          </span>
        )}
      </div>

      <div className="sequence-playback">
        <button
          className={`secondary-button ${playback === "answer" ? "button-playing" : ""}`}
          disabled={gridLocked || !hasNotes}
          onClick={() => void play("answer")}
        >
          {playback === "answer" ? (
            <Square size={14} fill="currentColor" />
          ) : (
            <Play size={15} fill="currentColor" />
          )}
          {playback === "answer" ? "Stop" : "Play"}
        </button>
        {!progress.submitted && (
          <p className="sequence-phase-note" role="status">
            {gridLocked ? (
              <>
                <LockKeyhole size={13} />
                Listen to all six loops to unlock the grid.
              </>
            ) : (
              <>
                <CheckCheck size={14} />
                Your turn. The grid is unlocked.
              </>
            )}
          </p>
        )}
      </div>

      <div
        className="sequencer-scroll"
        tabIndex={0}
        role="region"
        aria-label="Rhythm grid. Scroll horizontally on small screens."
      >
        <div
          className="sequencer"
          ref={gridRef}
          role="group"
          aria-label={
            progress.submitted
              ? `${resultView === "solution" ? "Correct solution" : "Your submitted rhythm"}`
              : "Your rhythm. Use arrow keys to move and Space to toggle a hit."
          }
        >
          <div className="step-labels sequence-row" aria-hidden="true">
            <span className="instrument-heading">INSTRUMENT</span>
            {Array.from({ length: 16 }, (_, step) => (
              <span
                className={`step-label ${step % 4 === 0 ? "downbeat" : ""} ${currentStep === step ? "current" : ""}`}
                key={step}
              >
                {String(step + 1).padStart(2, "0")}
              </span>
            ))}
          </div>
          {TRACKS.map((track, trackIndex) => (
            <div
              className={`sequence-row track-${track.id}`}
              key={track.id}
              style={{ "--track-color": track.color } as CSSProperties}
            >
              <button
                className="instrument-button"
                disabled={gridLocked}
                onClick={() => void previewInstrument(track.id)}
                aria-label={`Preview ${track.label} sound`}
                title={`Hear the ${track.label.toLowerCase()}`}
              >
                <span
                  className={`instrument-icon icon-${track.id}`}
                  aria-hidden="true"
                >
                  <span />
                </span>
                <span>{track.label}</span>
                <Volume2 className="instrument-volume" size={12} />
              </button>
              {displayPattern[track.id].map((active, step) => {
                const cellIndex = trackIndex * STEP_COUNT + step;
                const wrong =
                  progress.submitted &&
                  progress.pattern[track.id][step] !==
                    puzzle.pattern[track.id][step];
                return (
                  <button
                    key={step}
                    data-cell={cellIndex}
                    className={`pad ${active ? "pad-active" : ""} ${step % 4 === 0 ? "bar-start" : ""} ${Math.floor(step / 4) % 2 ? "alternate-beat" : ""} ${currentStep === step ? "pad-playing" : ""} ${wrong ? "pad-mismatch" : ""}`}
                    aria-label={`${track.label}, step ${step + 1}${progress.submitted ? `${wrong ? ", incorrect" : ", correct"}${active ? ", hit" : ", rest"}` : ""}`}
                    aria-pressed={active}
                    disabled={gridLocked}
                    aria-disabled={gridLocked || progress.submitted}
                    tabIndex={focusedCell === cellIndex ? 0 : -1}
                    onFocus={() => setFocusedCell(cellIndex)}
                    onClick={() => toggleCell(track.id, step)}
                    onKeyDown={(event) => navigateGrid(event, cellIndex)}
                  >
                    {active ? (
                      <span className="pad-hit" />
                    ) : (
                      <span className="pad-rest" />
                    )}
                    {wrong && <span className="mismatch-dot" />}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="beat-groups" aria-hidden="true">
            <span />
            <span>BEAT 1</span>
            <span>BEAT 2</span>
            <span>BEAT 3</span>
            <span>BEAT 4</span>
          </div>
        </div>
      </div>
      <p className="mobile-scroll-hint">
        Swipe to see all 16 steps <ArrowRight size={12} />
      </p>

      <div className="grid-utilities flex items-center justify-between gap-3">
        <p className="grid-hint">
          {progress.submitted ? (
            <>
              <span className="legend-correct" /> Correct
              <span className="legend-mismatch" /> Missed or extra hit
            </>
          ) : (
            <>
              {gridLocked ? (
                <LockKeyhole size={12} />
              ) : (
                <span className="hint-square" />
              )}
              {gridLocked
                ? "Listen first. Your grid will unlock automatically."
                : "Add a hit to hear it. Click again to remove it."}
            </>
          )}
        </p>
        {!progress.submitted && (
          <button
            className="text-button"
            disabled={gridLocked || !hasNotes}
            onClick={() => {
              if (clearConfirmation) {
                stopPlayback();
                onChange({
                  ...progressRef.current,
                  pattern: createEmptyPattern(),
                });
                setClearConfirmation(false);
              } else {
                setClearConfirmation(true);
              }
            }}
          >
            <RotateCcw size={13} />
            {clearConfirmation ? "Click to confirm" : "Clear grid"}
          </button>
        )}
        {clearConfirmation && !progress.submitted && (
          <button
            className="icon-button cancel-clear"
            onClick={() => setClearConfirmation(false)}
            aria-label="Cancel clear grid"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {details ? (
        <div
          className="round-result"
          role="status"
          tabIndex={-1}
          ref={resultRef}
        >
          <div className="result-score">
            <span className="result-check">
              <CheckCheck size={23} />
            </span>
            <div>
              <p className="eyebrow">
                {details.accuracy === 100
                  ? "PERFECTLY IN SYNC"
                  : details.accuracy >= 80
                    ? "THAT’S A GOOD GROOVE"
                    : "EVERY BEAT IS PRACTICE"}
              </p>
              <h3>
                <strong>{details.accuracy}%</strong> accuracy{" "}
                <span>
                  · {details.matchedHits} of {details.requiredHits} required
                  hits found
                </span>
              </h3>
            </div>
          </div>
          {onNext && (
            <button
              className="primary-button"
              onClick={() => {
                stopPlayback();
                onNext();
              }}
            >
              {nextLabel}
              <ArrowRight size={17} />
            </button>
          )}
        </div>
      ) : (
        <div className="board-actions board-actions-submit">
          <div className="submit-area">
            <span>
              {gridLocked
                ? "First listen. Then make it yours."
                : "No rush. Make it yours."}
            </span>
            <button
              className="primary-button"
              onClick={submit}
              disabled={gridLocked}
            >
              Submit beat
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}
      {progress.submitted && (
        <div className="post-result-actions">
          <span>
            Score = 100 − (100 ÷ required hits) × missed hits. Extra hits don’t
            reduce your score.
          </span>
        </div>
      )}

      <div className="board-bottom-note">
        <Headphones size={13} />
        <span>Headphones on. World off.</span>
        <button
          onClick={() => {
            stopPlayback();
            onHelp();
          }}
          className="help-text-button"
        >
          <CircleHelp size={13} /> How to play
        </button>
      </div>
    </section>
  );
}
