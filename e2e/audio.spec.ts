import { expect, test, type Page } from "@playwright/test";
import { getDailyChallenge, getLocalDateKey } from "../src/lib/daily";
import { LISTENING_LOOPS, TRACKS } from "../src/lib/types";
import { audioProbe, installAudioProbe, seedDailyRound } from "./helpers";

async function completedLoops(page: Page, key: string): Promise<number> {
  return page.evaluate(
    (storageKey) =>
      JSON.parse(localStorage.getItem(storageKey)!).rounds[0].completedLoops,
    key,
  );
}

for (const pauseControl of ["Space", "button"] as const) {
  test(`the reference cannot pause before one full loop; ${pauseControl} then ends it permanently`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const storageKey = await seedDailyRound(page, getLocalDateKey(), 0);
    await page.goto("/");
    await installAudioProbe(page);
    const reference = page.locator(".listen-button");
    const submit = page.getByRole("button", {
      name: "Submit beat",
      exact: true,
    });
    await expect(page.locator(".pad:disabled")).toHaveCount(48);
    await page.keyboard.press("Space");
    await expect(
      page.getByRole("heading", { name: "Get ready… 3" }),
    ).toBeVisible();
    await expect(reference).toBeDisabled();
    await page.keyboard.press("Space");
    await reference.dispatchEvent("click");
    await expect(
      page.getByRole("heading", { name: /Get ready/ }),
    ).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: "Find the groove.", exact: true }),
    ).toBeVisible({ timeout: 6_000 });
    await page.waitForTimeout(200);
    expect(await completedLoops(page, storageKey)).toBe(0);
    await page.keyboard.press("Space");
    await reference.dispatchEvent("click");
    await expect(reference).toBeDisabled();
    await expect(page.locator(".pad-playing")).toHaveCount(3);
    await expect(page.locator(".pad:disabled")).toHaveCount(48);
    await expect(submit).toBeDisabled();
    expect((await audioProbe(page)).plays).toHaveLength(1);
    expect((await audioProbe(page)).plays[0].loopCallbacks).toEqual([]);
    expect(
      await page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)!).rounds[0].referenceEnded,
        storageKey,
      ),
    ).toBe(false);
    await expect(
      page.getByRole("progressbar", { name: "Loops completed" }),
    ).toHaveAttribute("aria-valuenow", "1", { timeout: 5000 });
    await expect(reference).toBeEnabled();
    if (pauseControl === "Space") await page.keyboard.press("Space");
    else await reference.click();
    await expect(reference).toBeDisabled();
    await expect(page.locator(".pad-playing")).toHaveCount(0);
    await expect(page.locator(".pad:disabled")).toHaveCount(0);
    await expect(submit).toBeEnabled();
    expect((await audioProbe(page)).plays[0].loopCallbacks).toEqual([1]);
    expect(
      (await audioProbe(page)).plays[0].countIns.filter(
        (beat) => beat !== null,
      ),
    ).toEqual([3, 2, 1]);
    expect(
      await page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)!).rounds[0].referenceEnded,
        storageKey,
      ),
    ).toBe(true);
    // With an empty answer, Space must not restart the ended reference.
    await page.keyboard.press("Space");
    await reference.dispatchEvent("click");
    expect((await audioProbe(page)).plays).toHaveLength(1);
    await page.reload();
    await installAudioProbe(page);
    await expect(reference).toBeDisabled();
    await expect(submit).toBeEnabled();
    await expect(
      page.getByRole("progressbar", { name: "Loops completed" }),
    ).toHaveAttribute("aria-valuenow", "1");
    await page.keyboard.press("Space");
    expect((await audioProbe(page)).plays).toHaveLength(0);
    const kick = page.getByRole("button", {
      name: "Kick, step 1",
      exact: true,
    });
    await kick.click();
    await page.keyboard.press("Space");
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    expect((await audioProbe(page)).plays[0].countIn).toBe(false);
    await page.keyboard.press("Space");
    await submit.click();
    await expect(page.locator(".round-result")).toBeVisible();
    await expect(reference).toBeDisabled();
    await reference.dispatchEvent("click");
    expect((await audioProbe(page)).plays).toHaveLength(1);
    expect(await completedLoops(page, storageKey)).toBe(1);
    expect(errors).toEqual([]);
  });
}

test("added pads sound and live editing and clearing keep Play running without resetting; mistakes include misses and extras", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const storageKey = await seedDailyRound(
    page,
    getLocalDateKey(),
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
    [
      new Date().getFullYear(),
      String(new Date().getMonth() + 1).padStart(2, "0"),
      String(new Date().getDate()).padStart(2, "0"),
    ].join("-"),
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
    `${Math.round((100 * (required.length - 1)) / (required.length + 1))}%`,
  );
  await expect(page.locator(".pad-mismatch")).toHaveCount(2);
  await expect(page.locator(".listen-button")).toBeDisabled();
  await page.locator(".listen-button").dispatchEvent("click");
  expect((await audioProbe(page)).plays).toHaveLength(1);
  // Players can still replay their submitted answer without replaying the reference.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".pad-playing")).toHaveCount(3, { timeout: 1_000 });
  expect((await audioProbe(page)).plays[1].countIn).toBe(false);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  expect(await completedLoops(page, storageKey)).toBe(6);
  expect(errors).toEqual([]);
});

test("help, hidden tabs, and mode switches permanently end a started reference", async ({
  page,
}) => {
  const storageKey = await seedDailyRound(page, getLocalDateKey(), 0);
  await page.goto("/");
  for (const reason of ["help", "hidden", "mode"] as const) {
    await test.step(reason, async () => {
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await installAudioProbe(page);
      await page
        .getByRole("button", { name: "Listen to the beat", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Get ready… 3" }),
      ).toBeVisible();
      if (reason === "help") {
        await page.locator(".header-help").click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
      } else if (reason === "hidden") {
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", {
            configurable: true,
            value: true,
          });
          document.dispatchEvent(new Event("visibilitychange"));
          Reflect.deleteProperty(document, "hidden");
        });
      } else {
        await page
          .getByRole("button", { name: "Practice", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Daily beat", exact: true })
          .click();
      }
      await expect(page.locator(".listen-button")).toBeDisabled();
      await expect(page.locator(".pad-playing")).toHaveCount(0);
      await expect(page.locator(".pad:disabled")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Submit beat", exact: true }),
      ).toBeEnabled();
      expect(
        await page.evaluate(
          (key) =>
            JSON.parse(localStorage.getItem(key)!).rounds[0].referenceEnded,
          storageKey,
        ),
      ).toBe(true);
      await page.reload();
      await expect(page.locator(".listen-button")).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Submit beat", exact: true }),
      ).toBeEnabled();
    });
  }
});
