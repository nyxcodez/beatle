# Beatle

A daily drum rhythm puzzle built with React, TypeScript, Vite, Tailwind CSS, and Tone.js. No backend, accounts, or external audio samples.

## Run locally

Use Node.js 22.12+ (or 24+) and npm.

```sh
npm ci
npm run dev
```

Open the Vite address printed in the terminal. Audio starts only after a click. Fonts and synthesized drum sounds are bundled locally; no keys or external services are required.

## Play

- Each UTC day has three deterministic, curated 16-step puzzles with kick, snare, and closed hi-hat.
- Press the coral play button to hear the target, after a four-beat count-in. The 30-second listening budget is shared across replays; count-ins and your own beat do not consume it. Playback pauses when the tab is hidden or instructions are opened.
- Toggle pads to recreate the loop. Sixteen sixteenth notes make one bar of 4/4. Use arrow keys to navigate and Space or Enter to toggle. Instrument labels preview their sound.
- Editing and auditioning your own sequence have no time limit. Editing a sequence stops its current preview; play it again to hear changes.
- Submit once per round to reveal the correct solution, compare with your answer, and replay either rhythm. Correct hits and correct rests count equally: `round(100 × matching cells / 48)`. Scores range from 0–100 per round, with a daily maximum of 300.
- Daily answers, submissions, and consumed listening time are saved in this browser’s localStorage. The challenge resets at **00:00 UTC**, including while the game is open. Practice offers unlimited rounds and never changes daily progress.

Progress is local to this browser and origin; clearing site data resets it. Without a backend, local clock changes or manually edited browser storage cannot be prevented. The daily pattern catalogue is versioned in source; keep existing puzzle IDs/patterns and the selection algorithm stable to preserve existing daily scores.

## Verify

```sh
npm test          # scoring, puzzle validation, UTC selection, persistence
npm run build    # strict TypeScript check + production bundle
npm run test:e2e # real Chromium game and audio workflows
```

Browser tests use `/usr/bin/chromium` when available, otherwise Playwright’s Chromium. Install it once if needed:

```sh
npx playwright install chromium
npm run test:e2e
```

Set `CHROMIUM_PATH` to use a different Chromium executable.

`npm run preview` serves the production build. Deploy `dist/` to any static host. For a subdirectory deployment, set Vite’s `base` first.

## Structure

| Module                            | Responsibility                                                         |
| --------------------------------- | ---------------------------------------------------------------------- |
| `src/audio/BeatleAudioEngine.ts`  | Tone.js voices, count-in, transport scheduling, cancellation, disposal |
| `src/lib/types.ts`                | Shared puzzle, track, and progress types                               |
| `src/lib/puzzles.ts`              | Curated rhythms and strict validation                                  |
| `src/lib/scoring.ts`              | Pure, validated 48-cell accuracy calculation                           |
| `src/lib/daily.ts`                | UTC keys, seeded daily selection, practice, safe persistence           |
| `src/lib/useDailyGame.ts`         | React persistence and live UTC rollover                                |
| `src/components/RoundBoard.tsx`   | Sequencer, listening budget, playback, result comparison               |
| `src/components/DailySummary.tsx` | Daily totals, copyable results, reset countdown                        |
| `src/components/HelpDialog.tsx`   | Accessible instructions dialog                                         |
| `src/App.tsx`                     | Daily/practice orchestration and round navigation                      |

The core round was implemented and passed browser tests before adding the daily system. The grid, audio engine, scoring, and selection logic are independent modules so they can evolve separately.
