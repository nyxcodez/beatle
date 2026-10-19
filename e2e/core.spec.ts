import { expect, test } from "@playwright/test";
import { getDailyChallenge } from "../src/lib/daily";
import { audioProbe, fillPuzzle, installAudioProbe } from "./helpers";

test("a complete round: hear exactly six full loops, unlock the grid, play immediately, submit, and reveal", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await installAudioProbe(page);
  const dateKey = await page.evaluate(() =>
    new Date().toISOString().slice(0, 10),
  );
  const puzzle = getDailyChallenge(dateKey).puzzles[0];
  const loops = page.getByRole("progressbar", { name: "Loops completed" });
  const submit = page.getByRole("button", { name: "Submit beat", exact: true });
  const firstPad = page.getByRole("button", {
    name: "Kick, step 1",
    exact: true,
  });
  await expect(
    page.getByRole("heading", { name: "Find your rhythm." }),
  ).toBeVisible();
  await expect(page.locator(".pad")).toHaveCount(48);
  await expect(page.locator(".pad:disabled")).toHaveCount(48);
  await expect(page.locator(".pad-active")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeDisabled();
  await expect(submit).toBeDisabled();
  await expect(loops).toHaveAttribute("aria-valuemax", "6");
  await expect(loops).toHaveAttribute("aria-valuenow", "0");
  await firstPad.dispatchEvent("click");
  await expect(firstPad).toHaveAttribute("aria-pressed", "false");

  await page
    .getByRole("button", { name: "Listen to the beat", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /Get ready/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Find the groove." }),
  ).toBeVisible({ timeout: 6_000 });
  await expect(loops).toHaveAttribute("aria-valuenow", "0");
  await expect(loops).toHaveAttribute("aria-valuenow", "5", {
    timeout: 18_000,
  });
  // The grid stays locked while the reference is still playing.
  await expect(firstPad).toBeDisabled();
  await expect(submit).toBeDisabled();
  await expect(loops).toHaveAttribute("aria-valuenow", "6", { timeout: 5_000 });
  await expect(
    page.getByRole("heading", { name: "Now, trust your ears." }),
  ).toBeVisible();
  await expect(page.locator(".pad-playing")).toHaveCount(0);
  await expect(page.locator(".pad:disabled")).toHaveCount(0);
  await expect(submit).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Listen to the beat", exact: true }),
  ).toBeDisabled();
  await page.waitForTimeout(250);
  const target = (await audioProbe(page)).plays[0];
  expect(target.loopCallbacks).toEqual([1, 2, 3, 4, 5, 6]);
  expect(target.countIns.filter((beat) => beat !== null)).toEqual([3, 2, 1]);
  expect(target.firstSteps).toBe(6);
  expect(target.complete).toBe(true);

  await firstPad.focus();
  await page.keyboard.press("ArrowRight");
  const secondPad = page.getByRole("button", {
    name: "Kick, step 2",
    exact: true,
  });
  await expect(secondPad).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(secondPad).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  expect((await audioProbe(page)).previews).toEqual(["kick"]);
  await fillPuzzle(page, puzzle);
  const play = page.getByRole("button", { name: "Play", exact: true });
  const placement = await play.evaluate((element) => {
    const heading = document
      .querySelector(".sequence-heading")!
      .getBoundingClientRect();
    const button = element.getBoundingClientRect();
    const grid = document
      .querySelector(".sequencer-scroll")!
      .getBoundingClientRect();
    return {
      below: button.top >= heading.bottom,
      aboveGrid: button.bottom <= grid.top,
    };
  });
  expect(placement).toEqual({ below: true, aboveGrid: true });
  await play.click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".pad-playing")).toHaveCount(3, { timeout: 1_000 });
  await expect(page.getByRole("button", { name: /Count-in/ })).toHaveCount(0);
  expect((await audioProbe(page)).plays[1].countIn).toBe(false);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await submit.click();
  await expect(page.locator(".round-result")).toContainText("100%");
  await expect(
    page.getByRole("button", { name: "The solution", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pad-mismatch")).toHaveCount(0);
  await expect(page.locator(".listen-button")).toBeDisabled();
  await page.locator(".listen-button").dispatchEvent("click");
  expect((await audioProbe(page)).plays).toHaveLength(2);
  expect(errors).toEqual([]);
});
