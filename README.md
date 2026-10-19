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
- Press the cyan listening button for **three count-in ticks: 3, 2, 1**, then up to six complete loops. Each round has **one reference listening session**. The pause button and Space shortcut cannot pause the reference during the count-in or first loop; both unlock after **one complete loop**. Pausing afterward ends the session permanently and unlocks the grid. Opening instructions, hiding the tab, or leaving the round interrupts and ends the session, including before the first loop completes. The original cannot play again after refresh, switching modes, or submission. Completing all six loops also closes the session.
- Once the grid unlocks, toggle pads to recreate the loop. Sixteen sixteenth notes make one bar of 4/4. Use arrow keys to navigate and **Enter** to toggle. Switching a pad on plays its drum sound; switching it off is silent. Instrument labels also preview their sound.
- **Play**, directly below **Your sequence**, starts your beat immediately without a count-in. Use **Pause** or **Space** to stop it. Adding, removing, or clearing pads while your beat plays updates upcoming notes without restarting the loop or resetting its playhead. Editing and auditioning have no time limit.
- **Space** plays or pauses the active loop, including when a pad has keyboard focus. When idle, it plays your sequence if it contains hits; it starts the reference only if that listening session has not ended. Text fields, editable content, and open dialogs keep their normal Space behavior. Holding Space does not repeatedly toggle playback.
- Submit once per round to reveal the solution grid. You can continue playing your own sequence, but the original stays unavailable. The score is `round(100 * correctHits / (requiredHits + extraHits))`. An exact match earns 100; an empty or entirely wrong answer earns 0. With 12 required hits, finding all 12 plus two extra hits earns 86%; finding 8 of the 12 plus two extra hits earns 57%. No points are awarded for empty pads. An empty denominator scores 0. The maximum daily score is 300.
- Daily answers, submissions, and completed loop counts are saved in this browser’s localStorage. The challenge resets at **00:00 UTC**, including while the game is open. Practice offers unlimited rounds and never changes daily progress.

Progress is local to this browser and origin; clearing site data resets it. Without a backend, local clock changes or manually edited browser storage cannot be prevented. The daily pattern catalogue is versioned in source; keep existing puzzle IDs/patterns and the selection algorithm stable to preserve existing daily scores.

The reference-ended flag is saved with progress. Existing six-loop records are migrated without deleting answers: a previously played/submitted round is treated as having ended its reference session. Earlier 30-second records remain untouched in their older storage version. Saved scores are derived from submitted patterns using the current scoring formula.

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
| `src/lib/scoring.ts`              | Pure, validated required-hit scoring                                   |
| `src/lib/daily.ts`                | UTC keys, seeded daily selection, practice, safe persistence           |
| `src/lib/useDailyGame.ts`         | React persistence and live UTC rollover                                |
| `src/components/RoundBoard.tsx`   | Locked listening phase, sequencer, playback, result comparison         |
| `src/components/DailySummary.tsx` | Daily totals, copyable results, reset countdown                        |
| `src/components/HelpDialog.tsx`   | Accessible instructions dialog                                         |
| `src/App.tsx`                     | Daily/practice orchestration and round navigation                      |

The core round was implemented and passed browser tests before adding the daily system. The grid, audio engine, scoring, and selection logic are independent modules so they can evolve separately.
