import { expect, test } from "@playwright/test";
import { getDailyChallenge, getLocalDateKey } from "../src/lib/daily";
import { createEmptyPattern } from "../src/lib/types";
import {
  audioProbe,
  installAudioProbe,
  savedDaily,
  seedDailyRound,
} from "./helpers";

test("submission unlocks adjacent original playback and switches beats without overlapping or changing progress", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const dateKey = getLocalDateKey();
  await seedDailyRound(page, dateKey);
  await page.goto("/");
  await installAudioProbe(page);
  const answer = page.locator('button[data-playback="answer"]');
  const original = page.locator('button[data-playback="original"]');
  await expect(original).toHaveCount(0);
  await page.getByRole("button", { name: "Kick, step 1", exact: true }).click();
  await page.getByRole("button", { name: "Submit beat", exact: true }).click();
  await expect(original).toHaveText("Play original");
  expect(
    await answer.evaluate((button) =>
      button.nextElementSibling?.getAttribute("data-playback"),
    ),
  ).toBe("original");
  const saved = await savedDaily(page, dateKey);
  const score = await page.locator(".round-result").textContent();

  await answer.click();
  await expect(answer).toHaveText("Pause");
  await expect(page.locator(".pad-playing")).toHaveCount(3);
  const answerPattern = createEmptyPattern();
  answerPattern.kick[0] = true;
  expect((await audioProbe(page)).plays[0].pattern).toEqual(answerPattern);

  await original.click();
  await expect(original).toHaveText("Pause original");
  await expect(answer).toHaveText("Play");
  await expect(
    page.locator('.sequence-playback [aria-pressed="true"]'),
  ).toHaveCount(1);
  await expect(page.locator(".pad-playing")).toHaveCount(3);
  const switching = await audioProbe(page);
  expect(switching.plays).toHaveLength(2);
  expect(switching.plays[1].pattern).toEqual(
    getDailyChallenge(dateKey).puzzles[0].pattern,
  );
  expect(switching.plays[1].countIn).toBe(false);
  expect(switching.plays[1].maxLoops).toBeUndefined();
  await expect
    .poll(async () => (await audioProbe(page)).plays[1].steps.length)
    .toBeGreaterThan(3);
  expect((await audioProbe(page)).plays[0].steps).toEqual(
    switching.plays[0].steps,
  );

  // A focused transport button keeps normal Space activation, without a duplicate click.
  await page.keyboard.press("Space");
  await expect(original).toHaveText("Play original");
  await expect(page.locator(".pad-playing")).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(original).toHaveText("Pause original");
  expect((await audioProbe(page)).plays).toHaveLength(3);
  // With focus on the grid, Space still pauses/resumes the selected original.
  await page.locator(".pad").first().focus();
  await page.keyboard.press("Space");
  await expect(original).toHaveText("Play original");
  await page.keyboard.press("Space");
  await expect(original).toHaveText("Pause original");

  await answer.click();
  await expect(original).toHaveText("Play original");
  await expect(answer).toHaveText("Pause");
  await expect
    .poll(async () => (await audioProbe(page)).plays.at(-1)!.steps.length)
    .toBeGreaterThan(3);
  const switchedBack = await audioProbe(page);
  expect(switchedBack.plays.at(-1)!.pattern).toEqual(answerPattern);
  expect(switchedBack.plays[3].steps.length).toBeLessThan(16);
  expect(await savedDaily(page, dateKey)).toBe(saved);
  expect(await page.locator(".round-result").textContent()).toBe(score);
  await page.getByRole("button", { name: "Next round", exact: true }).click();
  await expect(page.locator(".pad-playing")).toHaveCount(0);
  await expect(original).toHaveCount(0);
  const stopped = await audioProbe(page);
  await page.waitForTimeout(300);
  expect((await audioProbe(page)).plays.map((play) => play.steps)).toEqual(
    stopped.plays.map((play) => play.steps),
  );
  expect(errors).toEqual([]);
});

test("an empty submitted answer can replay the original on a narrow screen and after reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const dateKey = getLocalDateKey();
  await seedDailyRound(page, dateKey);
  await page.goto("/");
  await installAudioProbe(page);
  await page.getByRole("button", { name: "Submit beat", exact: true }).click();
  const answer = page.locator('button[data-playback="answer"]');
  const original = page.locator('button[data-playback="original"]');
  await expect(answer).toBeDisabled();
  await expect(original).toBeEnabled();
  const answerBounds = await answer.boundingBox();
  const originalBounds = await original.boundingBox();
  expect(originalBounds!.y).toBe(answerBounds!.y);
  expect(originalBounds!.x).toBeGreaterThan(
    answerBounds!.x + answerBounds!.width,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const saved = await savedDaily(page, dateKey);
  await original.click();
  await expect(page.locator(".pad-playing")).toHaveCount(3);
  // Review playback can pause immediately, regardless of the original listening restriction.
  await original.click();
  await expect(original).toHaveText("Play original");
  await expect(page.locator(".pad-playing")).toHaveCount(0);
  expect((await audioProbe(page)).plays[0].countIn).toBe(false);
  expect((await audioProbe(page)).plays[0].loopCallbacks).toEqual([]);
  expect(await savedDaily(page, dateKey)).toBe(saved);

  await page.reload();
  await page
    .getByRole("button", { name: "Round 1, complete", exact: true })
    .click();
  await installAudioProbe(page);
  await expect(original).toHaveText("Play original");
  await original.click();
  await expect(page.locator(".pad-playing")).toHaveCount(3);
  expect((await audioProbe(page)).plays[0].pattern).toEqual(
    getDailyChallenge(dateKey).puzzles[0].pattern,
  );
  expect(await savedDaily(page, dateKey)).toBe(saved);
  await expect(page.locator(".round-result")).toContainText("0% accuracy");
});
