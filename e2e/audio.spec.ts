import { expect, test } from "@playwright/test";
import { getDailyChallenge, getUTCDateKey } from "../src/lib/daily";
import { TRACKS } from "../src/lib/types";
import {
  audioProbe,
  installAudioProbe,
  seedDailyRound,
  startTargetLoop,
} from "./helpers";

async function completedLoops(
  page: import("@playwright/test").Page,
  key: string,
): Promise<number> {
  return page.evaluate(
    (storageKey) =>
      JSON.parse(localStorage.getItem(storageKey)!).rounds[0].completedLoops,
    key,
  );
}

test("count-in and partial loops earn no credit; completed loops survive pause, reload, and resume", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const storageKey = await seedDailyRound(page, getUTCDateKey(), 4);
  await page.goto("/");
  await installAudioProbe(page);
  const loops = page.getByRole("progressbar", { name: "Loops completed" });
  await expect(loops).toHaveAttribute("aria-valuenow", "4");
  await expect(page.locator(".pad:disabled")).toHaveCount(48);
  await page
    .getByRole("button", { name: "Listen to the beat", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Get ready… 1" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Stop listening", exact: true })
    .click();
  expect(await completedLoops(page, storageKey)).toBe(4);
  expect((await audioProbe(page)).plays[0].loopCallbacks).toEqual([]);
  await expect(page.locator(".pad-playing")).toHaveCount(0);

  await startTargetLoop(page);
  await page.waitForTimeout(250);
  expect(await completedLoops(page, storageKey)).toBe(4);
  await expect(loops).toHaveAttribute("aria-valuenow", "5", { timeout: 5_000 });
  await page
    .getByRole("button", { name: "Stop listening", exact: true })
    .click();
  const beforePause = (await audioProbe(page)).plays[1];
  expect(beforePause.maxLoops).toBe(2);
  expect(beforePause.loopCallbacks).toEqual([1]);
  await page.waitForTimeout(350);
  expect(await completedLoops(page, storageKey)).toBe(5);
  await expect(page.locator(".pad:disabled")).toHaveCount(48);
  await expect(
    page.getByRole("button", { name: "Submit beat", exact: true }),
  ).toBeDisabled();

  await page.reload();
  await installAudioProbe(page);
  await expect(loops).toHaveAttribute("aria-valuenow", "5");
  await expect(page.locator(".pad:disabled")).toHaveCount(48);
  await startTargetLoop(page);
  await expect(loops).toHaveAttribute("aria-valuenow", "6", { timeout: 5_000 });
  await expect(page.locator(".pad:disabled")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Submit beat", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Listen to the beat", exact: true }),
  ).toBeDisabled();
  const resumed = (await audioProbe(page)).plays[0];
  expect(resumed.maxLoops).toBe(1);
  expect(resumed.loopCallbacks).toEqual([1]);
  expect(resumed.firstSteps).toBe(1);
  expect(resumed.complete).toBe(true);
  expect(await completedLoops(page, storageKey)).toBe(6);
  expect(errors).toEqual([]);
});

test("only added pads sound; Play starts immediately; scoring counts missed required hits and solution replay is unlimited", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const storageKey = await seedDailyRound(page);
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
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".pad-playing")).toHaveCount(3, { timeout: 1_000 });
  await expect(page.getByRole("button", { name: /Count-in/ })).toHaveCount(0);
  expect((await audioProbe(page)).plays[0].countIn).toBe(false);
  // Editing a playing answer must stop the old sequence before sounding the new pad.
  await page.getByRole("button", { name: "Kick, step 4", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".pad-playing")).toHaveCount(0);
  expect((await audioProbe(page)).previews).toEqual([
    "kick",
    "snare",
    "hihat",
    "kick",
  ]);
  expect(await completedLoops(page, storageKey)).toBe(6);
  await page.getByRole("button", { name: "Clear grid", exact: true }).click();
  await page
    .getByRole("button", { name: "Click to confirm", exact: true })
    .click();

  const dateKey = await page.evaluate(() =>
    new Date().toISOString().slice(0, 10),
  );
  const puzzle = getDailyChallenge(dateKey).puzzles[0];
  const required = TRACKS.flatMap((track) =>
    puzzle.pattern[track.id].map((hit, step) => ({
      hit,
      label: track.label,
      step,
    })),
  ).filter((cell) => cell.hit);
  for (const cell of required.slice(1)) {
    await page
      .getByRole("button", {
        name: `${cell.label}, step ${cell.step + 1}`,
        exact: true,
      })
      .click();
  }
  const extra = TRACKS.flatMap((track) =>
    puzzle.pattern[track.id].map((hit, step) => ({
      hit,
      label: track.label,
      step,
    })),
  ).find((cell) => !cell.hit)!;
  await page
    .getByRole("button", {
      name: `${extra.label}, step ${extra.step + 1}`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Submit beat", exact: true }).click();
  await expect(page.locator(".round-result")).toContainText(
    `${Math.round(100 - 100 / required.length)}%`,
  );
  await expect(page.locator(".pad-mismatch")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Play the solution", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Get ready… 1" }),
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
