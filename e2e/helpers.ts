import { expect, type Page } from "@playwright/test";
import {
  createDailyProgress,
  getDailyStorageKey,
  getLocalDateKey,
} from "../src/lib/daily";
import {
  MIN_LISTENING_LOOPS,
  type Puzzle,
  type RhythmPattern,
  TRACKS,
} from "../src/lib/types";

export interface PlaybackProbe {
  pattern: RhythmPattern;
  maxLoops?: number;
  countIn?: boolean;
  countIns: (number | null)[];
  loopCallbacks: number[];
  steps: number[];
  firstSteps: number;
  complete: boolean;
}

export interface AudioProbe {
  previews: string[];
  updates: RhythmPattern[];
  plays: PlaybackProbe[];
}

const audioEngineRequests = new WeakMap<Page, string>();
const watchedPages = new WeakSet<Page>();

function watchAudioEngineRequests(page: Page) {
  if (watchedPages.has(page)) return;
  watchedPages.add(page);
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/src/audio/BeatleAudioEngine.ts") {
      audioEngineRequests.set(page, request.url());
    }
  });
}

async function loadedAudioEngineUrl(page: Page): Promise<string> {
  // Use the actual UI import URL, including Vite's HMR timestamp. Network
  // observation also works when Playwright's clock replaces Performance APIs.
  const requested = audioEngineRequests.get(page);
  if (requested) return requested;
  const resource = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .reverse()
      .find(
        (name) => new URL(name).pathname === "/src/audio/BeatleAudioEngine.ts",
      ),
  );
  if (!resource)
    throw new Error("The board's audio engine module was not loaded.");
  return resource;
}

export async function seedDailyRound(
  page: Page,
  dateKey = getLocalDateKey(),
  completedLoops = MIN_LISTENING_LOOPS,
) {
  watchAudioEngineRequests(page);
  const progress = createDailyProgress(dateKey);
  progress.rounds[0].completedLoops = completedLoops;
  progress.rounds[0].referenceEnded = completedLoops > 0;
  const record = {
    key: getDailyStorageKey(dateKey),
    value: JSON.stringify(progress),
  };
  // Preserve later changes when tests reload or navigate within this browser context.
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, record);
  return record.key;
}

export async function unlockCurrentDailyRound(page: Page, dateKey: string) {
  await page.evaluate(
    ({ key, loops }) => {
      const progress = JSON.parse(localStorage.getItem(key)!);
      const current = progress.rounds.find(
        (round: { submitted: boolean }) => !round.submitted,
      );
      current.completedLoops = loops;
      current.referenceEnded = true;
      localStorage.setItem(key, JSON.stringify(progress));
    },
    { key: getDailyStorageKey(dateKey), loops: MIN_LISTENING_LOOPS },
  );
  await page.reload();
}

export async function fillPuzzle(page: Page, puzzle: Puzzle) {
  for (const { id, label } of TRACKS) {
    for (let step = 0; step < 16; step += 1) {
      if (puzzle.pattern[id][step]) {
        await page
          .getByRole("button", {
            name: `${label}, step ${step + 1}`,
            exact: true,
          })
          .click();
      }
    }
  }
}

export async function savedDaily(page: Page, dateKey: string) {
  return page.evaluate(
    (key) => localStorage.getItem(key),
    getDailyStorageKey(dateKey),
  );
}

export async function startTargetLoop(page: Page) {
  await page
    .getByRole("button", { name: "Listen to the beat", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Get ready… 3" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Find the groove.", exact: true }),
  ).toBeVisible({ timeout: 6_000 });
  await expect(page.locator(".pad-playing")).toHaveCount(3);
}

/** Observe the real engine rather than replacing its Tone scheduling. */
export async function installAudioProbe(page: Page) {
  const modulePath = await loadedAudioEngineUrl(page);
  await page.evaluate(async (modulePath) => {
    const { BeatleAudioEngine } = await import(/* @vite-ignore */ modulePath);
    const probe: AudioProbe = { previews: [], updates: [], plays: [] };
    (window as unknown as { beatleAudioProbe: typeof probe }).beatleAudioProbe =
      probe;
    const originalPlay = BeatleAudioEngine.prototype.play;
    const originalPreview = BeatleAudioEngine.prototype.preview;
    const originalUpdate = BeatleAudioEngine.prototype.updatePattern;
    BeatleAudioEngine.prototype.updatePattern = function (
      pattern: RhythmPattern,
    ) {
      probe.updates.push(structuredClone(pattern));
      return originalUpdate.call(this, pattern);
    };
    BeatleAudioEngine.prototype.play = function (
      pattern: unknown,
      bpm: number,
      options: Record<string, any> = {},
    ) {
      const play: PlaybackProbe = {
        pattern: structuredClone(pattern as RhythmPattern),
        maxLoops: options.maxLoops,
        countIn: options.countIn,
        countIns: [],
        loopCallbacks: [],
        steps: [],
        firstSteps: 0,
        complete: false,
      };
      probe.plays.push(play);
      return originalPlay.call(this, pattern, bpm, {
        ...options,
        onStep: (step: number) => {
          play.steps.push(step);
          if (step === 0) play.firstSteps += 1;
          options.onStep?.(step);
        },
        onCountIn: (beat: number | null) => {
          play.countIns.push(beat);
          options.onCountIn?.(beat);
        },
        onLoopComplete: (loop: number) => {
          play.loopCallbacks.push(loop);
          options.onLoopComplete?.(loop);
        },
        onComplete: () => {
          play.complete = true;
          options.onComplete?.();
        },
      });
    };
    BeatleAudioEngine.prototype.preview = function (track: string) {
      probe.previews.push(track);
      return originalPreview.call(this, track);
    };
  }, modulePath);
}

export async function audioProbe(page: Page): Promise<AudioProbe> {
  return page.evaluate(
    () =>
      (window as unknown as { beatleAudioProbe: AudioProbe }).beatleAudioProbe,
  );
}

/** Daily/practice integration tests cover state transitions; audio tests use real time. */
export async function completeListeningWithoutAudio(page: Page) {
  const modulePath = await loadedAudioEngineUrl(page);
  await page.evaluate(async (modulePath) => {
    const { BeatleAudioEngine } = await import(/* @vite-ignore */ modulePath);
    const originalPlay = BeatleAudioEngine.prototype.play;
    BeatleAudioEngine.prototype.play = async function (
      pattern: unknown,
      bpm: number,
      options: Record<string, any> = {},
    ) {
      if (!options.maxLoops)
        return originalPlay.call(this, pattern, bpm, options);
      options.onCountIn?.(null);
      for (let loop = 1; loop <= options.maxLoops; loop += 1)
        options.onLoopComplete?.(loop);
      options.onComplete?.();
    };
  }, modulePath);
  await page
    .getByRole("button", { name: "Listen to the beat", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Submit beat", exact: true }),
  ).toBeEnabled();
}
