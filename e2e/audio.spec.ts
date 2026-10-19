import { expect, test, type Page } from "@playwright/test";
import { getDailyChallenge, getUTCDateKey } from "../src/lib/daily";
import { LISTENING_LOOPS, TRACKS } from "../src/lib/types";
import {
  audioProbe,
  installAudioProbe,
  seedDailyRound,
  startTargetLoop,
} from "./helpers";

async function completedLoops(page: Page, key: string): Promise<number> {
  return page.evaluate(
    (storageKey) =>
      JSON.parse(localStorage.getItem(storageKey)!).rounds[0].completedLoops,
    key,
  );
}

test("Space pauses the reference; one full bar unlocks editing and submission and survives reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const storageKey = await seedDailyRound(page, getUTCDateKey(), 0);
  await page.goto("/");
  await installAudioProbe(page);
  const loops = page.getByRole("progressbar", { name: "Loops completed" });
  const submit = page.getByRole("button", { name: "Submit beat", exact: true });
  await expect(page.locator(".pad:disabled")).toHaveCount(48);
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("heading", { name: "Get ready… 3" }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  expect(await completedLoops(page, storageKey)).toBe(0);
  expect((await audioProbe(page)).plays[0].loopCallbacks).toEqual([]);
  await expect(page.locator(".pad:disabled")).toHaveCount(48);
  await expect(submit).toBeDisabled();

  await startTargetLoop(page);
  await page.waitForTimeout(250);
  expect(await completedLoops(page, storageKey)).toBe(0);
  await expect(loops).toHaveAttribute("aria-valuenow", "1", { timeout: 5_000 });
  await expect(page.locator(".pad:disabled")).toHaveCount(48);
  await expect(submit).toBeDisabled();
  await page.keyboard.press("Space");
  await expect(page.locator(".pad-playing")).toHaveCount(0);
  await expect(page.locator(".pad:disabled")).toHaveCount(0);
  await expect(submit).toBeEnabled();
  const heard = (await audioProbe(page)).plays[1];
  expect(heard.maxLoops).toBe(6);
  expect(heard.loopCallbacks).toEqual([1]);
  expect(heard.countIns.filter((beat) => beat !== null)).toEqual([3, 2, 1]);
  await page.waitForTimeout(250);
  expect(await completedLoops(page, storageKey)).toBe(1);
  await page.getByRole("button", { name: "Kick, step 1", exact: true }).click();
  await page.reload();
  await installAudioProbe(page);
  await expect(loops).toHaveAttribute("aria-valuenow", "1");
  await expect(
    page.getByRole("button", { name: "Kick, step 1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(submit).toBeEnabled();

  await page
    .getByRole("button", { name: "Listen to the beat", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Get ready… 3" }),
  ).toBeVisible();
  await expect(page.locator(".pad:disabled")).toHaveCount(48);
  expect((await audioProbe(page)).plays[0].maxLoops).toBe(5);
  await page.keyboard.press("Space");
  await expect(submit).toBeEnabled();
  expect(await completedLoops(page, storageKey)).toBe(1);
  await submit.click();
  await expect(page.locator(".round-result")).toBeVisible();
  expect(await completedLoops(page, storageKey)).toBe(1);
  expect(errors).toEqual([]);
});

test("added pads sound and live editing and clearing keep Play running without resetting; mistakes include misses and extras", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const storageKey = await seedDailyRound(
    page,
    getUTCDateKey(),
    LISTENING_LOOPS,
  );
  await page.goto("/");
  await installAudioProbe(page);
  const kick = page.getByRole("button", { name: "Kick, step 1", exact: true });
  await kick.click();
  await kick.click();
  await page
    .getByRole("button", { name: "Snare, step 2", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hi-hat, step 3", exact: true })
    .click();
  expect((await audioProbe(page)).previews).toEqual(["kick", "snare", "hihat"]);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".pad-playing")).toHaveCount(3, { timeout: 1_000 });
  await expect(page.getByRole("button", { name: /Count-in/ })).toHaveCount(0);
  expect((await audioProbe(page)).plays[0].countIn).toBe(false);
  await expect
    .poll(async () => (await audioProbe(page)).plays[0].steps.length)
    .toBeGreaterThanOrEqual(3);
  const stepsBeforeEditing = (await audioProbe(page)).plays[0].steps.length;
  const livePad = page.getByRole("button", {
    name: "Kick, step 4",
    exact: true,
  });
  await livePad.click();
  await livePad.click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  expect((await audioProbe(page)).previews).toEqual([
    "kick",
    "snare",
    "hihat",
    "kick",
  ]);
  await page.getByRole("button", { name: "Clear grid", exact: true }).click();
  await page
    .getByRole("button", { name: "Click to confirm", exact: true })
    .click();
  await expect(page.locator(".pad-active")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(async () => (await audioProbe(page)).plays[0].steps.length)
    .toBeGreaterThan(stepsBeforeEditing + 3);
  const playing = await audioProbe(page);
  expect(playing.plays).toHaveLength(1);
  expect(playing.updates.length).toBeGreaterThanOrEqual(3);
  expect(Object.values(playing.updates.at(-1)!).flat().some(Boolean)).toBe(
    false,
  );
  expect(
    playing.plays[0].steps.every(
      (step, index, steps) =>
        step >= 0 && (index === 0 || step === (steps[index - 1] + 1) % 16),
    ),
  ).toBe(true);
  expect(await completedLoops(page, storageKey)).toBe(6);
  await page.getByRole("button", { name: "Pause", exact: true }).click();

  const dateKey = await page.evaluate(() =>
    new Date().toISOString().slice(0, 10),
  );
  const puzzle = getDailyChallenge(dateKey).puzzles[0];
  const cells = TRACKS.flatMap((track) =>
    puzzle.pattern[track.id].map((hit, step) => ({
      hit,
      label: track.label,
      step,
    })),
  );
  const required = cells.filter((cell) => cell.hit);
  for (const cell of required.slice(1)) {
    await page
      .getByRole("button", {
        name: `${cell.label}, step ${cell.step + 1}`,
        exact: true,
      })
      .click();
  }
  const extra = cells.find((cell) => !cell.hit)!;
  await page
    .getByRole("button", {
      name: `${extra.label}, step ${extra.step + 1}`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Submit beat", exact: true }).click();
  await expect(page.locator(".round-result")).toContainText(
    `${Math.round(100 - 200 / required.length)}%`,
  );
  await expect(page.locator(".pad-mismatch")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Play the solution", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Get ready… 3" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Find the groove.", exact: true }),
  ).toBeVisible({ timeout: 6_000 });
  await page.waitForTimeout(1_300);
  await expect(
    page.getByRole("button", { name: "Stop listening", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".pad-playing")).toHaveCount(3);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  expect((await audioProbe(page)).plays[1].maxLoops).toBeUndefined();
  expect(await completedLoops(page, storageKey)).toBe(6);
  await page
    .getByRole("button", { name: "Stop listening", exact: true })
    .click();
  expect(errors).toEqual([]);
});
