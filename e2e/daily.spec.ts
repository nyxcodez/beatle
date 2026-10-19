import { expect, test } from "@playwright/test";
import { getDailyChallenge, getDailyStorageKey } from "../src/lib/daily";
import { MIN_LISTENING_LOOPS, TRACKS } from "../src/lib/types";
import {
  completeListeningWithoutAudio,
  fillPuzzle,
  savedDaily,
  seedDailyRound,
  unlockCurrentDailyRound,
} from "./helpers";

const DATE_KEY = "2026-10-18";
const FIXED_TIME = new Date(`${DATE_KEY}T12:00:00.000Z`);

test("three sequential daily rounds score 300, persist after one reference bar, and remain immutable in review", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: FIXED_TIME });
  await seedDailyRound(page, DATE_KEY);
  await page.goto("/");
  const { puzzles } = getDailyChallenge(DATE_KEY);
  await expect(
    page.getByRole("button", { name: "Round 2, locked", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Round 3, locked", exact: true }),
  ).toBeDisabled();

  for (let index = 0; index < 3; index += 1) {
    await expect(page.locator(".round-board")).toHaveAttribute(
      "aria-label",
      `Round ${index + 1}`,
    );
    await fillPuzzle(page, puzzles[index]);
    await page
      .getByRole("button", { name: "Submit beat", exact: true })
      .click();
    await expect(page.locator(".round-result")).toContainText("100%");
    await expect(
      page.getByRole("button", { name: "The solution", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("group", { name: "Correct solution", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".pad-mismatch")).toHaveCount(0);
    await expect(page.locator('.pad[aria-disabled="true"]')).toHaveCount(48);
    await expect(page.locator(".total-score strong")).toHaveText(
      new RegExp(`^${(index + 1) * 100}\\s*\\/\\s*300$`),
    );
    if (index < 2) {
      await page
        .getByRole("button", { name: "Next round", exact: true })
        .click();
      await expect(page.locator(".pad-active")).toHaveCount(0);
      await expect(page.locator(".pad:disabled")).toHaveCount(48);
      await expect(
        page.getByRole("button", { name: "Submit beat", exact: true }),
      ).toBeDisabled();
      await unlockCurrentDailyRound(page, DATE_KEY);
    }
  }

  await page
    .getByRole("button", { name: "See daily results", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Perfectly in the pocket.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".summary-total strong")).toHaveText("300");
  const completedRecord = await savedDaily(page, DATE_KEY);
  expect(
    JSON.parse(completedRecord!).rounds.every(
      (round: {
        submitted: boolean;
        referenceEnded: boolean;
        completedLoops: number;
      }) =>
        round.submitted &&
        round.referenceEnded &&
        round.completedLoops === MIN_LISTENING_LOOPS,
    ),
  ).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Perfectly in the pocket.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review today’s rounds", exact: true })
    .click();
  for (let index = 0; index < 3; index += 1) {
    await page
      .getByRole("button", {
        name: `Round ${index + 1}, complete`,
        exact: true,
      })
      .click();
    await expect(page.locator(".round-result")).toContainText("100%");
    await page.getByRole("button", { name: "Your beat", exact: true }).click();
    const pad = page.locator(".pad").first();
    const original = await pad.getAttribute("aria-pressed");
    await pad.focus();
    await page.keyboard.press("Enter");
    await expect(pad).toHaveAttribute("aria-pressed", original!);
    await expect(
      page.getByRole("button", { name: "Submit beat", exact: true }),
    ).toHaveCount(0);
    expect(await savedDaily(page, DATE_KEY)).toBe(completedRecord);
  }
  expect(errors).toEqual([]);
});

test("unlocked notes and completed listening loops survive reload with unlimited editing time", async ({
  page,
}) => {
  await page.clock.install({ time: FIXED_TIME });
  await seedDailyRound(page, DATE_KEY);
  await page.goto("/");
  await page.getByRole("button", { name: "Kick, step 3", exact: true }).click();
  await page
    .getByRole("button", { name: "Snare, step 7", exact: true })
    .click();
  const record = JSON.parse((await savedDaily(page, DATE_KEY))!);
  expect(record.rounds[0].completedLoops).toBe(MIN_LISTENING_LOOPS);
  expect(record.rounds[0].submitted).toBe(false);
  expect(record.rounds[0].referenceEnded).toBe(true);
  // A v2 save from before the flag existed must preserve its edited answer.
  await page.evaluate((key) => {
    const legacy = JSON.parse(localStorage.getItem(key)!);
    delete legacy.rounds[0].referenceEnded;
    localStorage.setItem(key, JSON.stringify(legacy));
  }, getDailyStorageKey(DATE_KEY));
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Kick, step 3", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Snare, step 7", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("progressbar", { name: "Loops completed" }),
  ).toHaveAttribute("aria-valuenow", "1");
  await expect(
    page.getByRole("button", { name: "Round 2, locked", exact: true }),
  ).toBeDisabled();
  await page.clock.fastForward(120_000);
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "1",
  );
  await page
    .getByRole("button", { name: "Hi-hat, step 16", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Hi-hat, step 16", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Submit beat", exact: true }),
  ).toBeEnabled();
});

test("practice continues beyond three rounds, locks every new grid, and keeps daily attempts isolated", async ({
  page,
}) => {
  await page.clock.install({ time: FIXED_TIME });
  await seedDailyRound(page, DATE_KEY);
  await page.goto("/");
  await page.getByRole("button", { name: "Kick, step 5", exact: true }).click();
  const dailyRecord = await savedDaily(page, DATE_KEY);
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(
    page.getByText("Unlimited rounds", { exact: true }),
  ).toBeVisible();
  for (let round = 1; round <= 4; round += 1) {
    await expect(page.locator(".round-board")).toHaveAttribute(
      "aria-label",
      `Round ${round}`,
    );
    await expect(page.locator(".pad-active")).toHaveCount(0);
    await expect(page.locator(".pad:disabled")).toHaveCount(48);
    await expect(page.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    await expect(
      page.getByRole("button", { name: "Submit beat", exact: true }),
    ).toBeDisabled();
    await completeListeningWithoutAudio(page);
    await page
      .getByRole("button", { name: "Snare, step 2", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Submit beat", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "The solution", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Another groove", exact: true })
      .click();
    expect(await savedDaily(page, DATE_KEY)).toBe(dailyRecord);
  }
  await expect(page.locator(".round-board")).toHaveAttribute(
    "aria-label",
    "Round 5",
  );
  await expect(page.locator(".pad:disabled")).toHaveCount(48);
  await page.getByRole("button", { name: "Daily beat", exact: true }).click();
  await expect(page.locator(".round-board")).toHaveAttribute(
    "aria-label",
    "Round 1",
  );
  await expect(
    page.getByRole("button", { name: "Kick, step 5", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pad-active")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Round 2, locked", exact: true }),
  ).toBeDisabled();
  expect(await savedDaily(page, DATE_KEY)).toBe(dailyRecord);
});

test("UTC midnight starts a fresh locked day and preserves the prior day record", async ({
  page,
}) => {
  await page.clock.install({ time: new Date(`${DATE_KEY}T23:59:50.000Z`) });
  await seedDailyRound(page, DATE_KEY);
  await page.goto("/");
  await page.getByRole("button", { name: "Kick, step 1", exact: true }).click();
  const previousDay = await savedDaily(page, DATE_KEY);
  await page.clock.fastForward(11_000);
  await expect(page.locator('.notice-banner[role="status"]')).toContainText(
    "A new day, a new groove.",
  );
  await expect(page.locator(".challenge-date")).toContainText("OCT 19");
  await expect(page.locator(".pad-active")).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  await expect(page.locator(".pad:disabled")).toHaveCount(48);
  await expect(
    page.getByRole("button", { name: "Submit beat", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Round 2, locked", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Snare, step 8", exact: true })
    .dispatchEvent("click");
  await expect(page.locator(".pad-active")).toHaveCount(0);
  expect(await savedDaily(page, DATE_KEY)).toBe(previousDay);
});

test("blank answers score zero", async ({ page }) => {
  await page.clock.install({ time: FIXED_TIME });
  await seedDailyRound(page, DATE_KEY);
  await page.goto("/");
  await page.getByRole("button", { name: "Submit beat", exact: true }).click();
  await expect(page.locator(".round-result")).toContainText("0% accuracy");
  await expect(page.locator(".total-score strong")).toHaveText(
    /^0\s*\/\s*300$/,
  );
});

test("correct required hits plus extras score the selected union", async ({
  page,
}) => {
  await page.clock.install({ time: FIXED_TIME });
  await seedDailyRound(page, DATE_KEY);
  await page.goto("/");
  const puzzle = getDailyChallenge(DATE_KEY).puzzles[0];
  const cells = TRACKS.flatMap((track) =>
    puzzle.pattern[track.id].map((hit, step) => ({
      hit,
      label: track.label,
      step,
    })),
  );
  const required = cells.filter((cell) => cell.hit).length;
  await fillPuzzle(page, puzzle);
  for (const extra of cells.filter((cell) => !cell.hit).slice(0, 2)) {
    await page
      .getByRole("button", {
        name: `${extra.label}, step ${extra.step + 1}`,
        exact: true,
      })
      .click();
  }
  await page.getByRole("button", { name: "Submit beat", exact: true }).click();
  await expect(page.locator(".round-result")).toContainText(
    `${Math.round((100 * required) / (required + 2))}% accuracy`,
  );
  await expect(page.locator(".pad-mismatch")).toHaveCount(2);
});

test("selecting every pad scores required hits over all 48 pads", async ({
  page,
}) => {
  await page.clock.install({ time: FIXED_TIME });
  await seedDailyRound(page, DATE_KEY);
  await page.goto("/");
  const puzzle = getDailyChallenge(DATE_KEY).puzzles[0];
  const required = TRACKS.flatMap((track) => puzzle.pattern[track.id]).filter(
    Boolean,
  ).length;
  for (const track of TRACKS) {
    for (let step = 1; step <= 16; step += 1) {
      await page
        .getByRole("button", {
          name: `${track.label}, step ${step}`,
          exact: true,
        })
        .click();
    }
  }
  await page.getByRole("button", { name: "Submit beat", exact: true }).click();
  await expect(page.locator(".round-result")).toContainText(
    `${Math.round((100 * required) / 48)}% accuracy`,
  );
  await expect(page.locator(".pad-mismatch")).toHaveCount(48 - required);
});
