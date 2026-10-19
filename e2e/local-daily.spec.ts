import { expect, test, type Page } from "@playwright/test";
import {
  createDailyProgress,
  getDailyChallenge,
  getDailyStorageKey,
} from "../src/lib/daily";
import { clonePattern } from "../src/lib/types";
import { savedDaily, seedDailyRound } from "./helpers";

for (const { timezoneId, midnightStart } of [
  { timezoneId: "Europe/Bucharest", midnightStart: "2026-10-18T20:59:50Z" },
  { timezoneId: "America/New_York", midnightStart: "2026-10-19T03:59:50Z" },
]) {
  test.describe(`daily rollover in ${timezoneId}`, () => {
    test.use({ timezoneId });

    test("uses the local date and resets at local midnight without overwriting yesterday", async ({
      page,
    }) => {
      await page.clock.install({ time: new Date(midnightStart) });
      await seedDailyRound(page, "2026-10-18");
      await page.goto("/");
      await expect(page.locator(".challenge-date")).toContainText(
        "OCT 18 · LOCAL",
      );
      await expect(page.locator(".difficulty-label")).toHaveAttribute(
        "data-difficulty",
        "easy",
      );
      await page
        .getByRole("button", { name: "Kick, step 1", exact: true })
        .click();
      const yesterday = await savedDaily(page, "2026-10-18");
      await page.clock.fastForward(11_000);
      await expect(page.locator(".challenge-date")).toContainText(
        "OCT 19 · LOCAL",
      );
      await expect(page.locator(".notice-banner")).toContainText(
        "A new day, a new groove.",
      );
      await expect(page.locator(".pad-active")).toHaveCount(0);
      await expect(page.locator(".pad:disabled")).toHaveCount(48);
      await expect(
        page.getByRole("progressbar", { name: "Loops completed" }),
      ).toHaveAttribute("aria-valuenow", "0");
      expect(await savedDaily(page, "2026-10-18")).toBe(yesterday);
      await page.reload();
      await expect(page.locator(".challenge-date")).toContainText(
        "OCT 19 · LOCAL",
      );
      await expect(page.locator(".pad:disabled")).toHaveCount(48);
    });
  });
}

async function seedCompletedDay(page: Page, dateKey: string) {
  const progress = createDailyProgress(dateKey);
  const challenge = getDailyChallenge(dateKey);
  progress.rounds.forEach((round, index) => {
    round.completedLoops = 1;
    round.referenceEnded = true;
    round.submitted = true;
    round.pattern = clonePattern(challenge.puzzles[index].pattern);
  });
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    {
      key: getDailyStorageKey(dateKey),
      value: JSON.stringify(progress),
    },
  );
}

test.describe("local reset countdown in New York", () => {
  test.use({ timezoneId: "America/New_York" });

  test("does not reset at UTC midnight when the local day has not ended", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-10-18T23:59:50Z") });
    await seedDailyRound(page, "2026-10-18");
    await page.goto("/");
    await page
      .getByRole("button", { name: "Kick, step 1", exact: true })
      .click();
    const before = await savedDaily(page, "2026-10-18");
    await page.clock.fastForward(11_000);
    await expect(page.locator(".challenge-date")).toContainText(
      "OCT 18 · LOCAL",
    );
    await expect(page.locator(".notice-banner")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Kick, step 1", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(await savedDaily(page, "2026-10-18")).toBe(before);
  });

  for (const { name, time, dateKey, countdown } of [
    {
      name: "ordinary evening",
      time: "2026-10-19T02:30:00Z",
      dateKey: "2026-10-18",
      countdown: "01:30:00",
    },
    {
      name: "23-hour spring daylight-saving day",
      time: "2026-03-08T05:00:00Z",
      dateKey: "2026-03-08",
      countdown: "23:00:00",
    },
    {
      name: "25-hour autumn daylight-saving day",
      time: "2026-11-01T04:00:00Z",
      dateKey: "2026-11-01",
      countdown: "25:00:00",
    },
  ]) {
    test(`shows the correct local countdown on an ${name}`, async ({
      page,
    }) => {
      await page.clock.setFixedTime(new Date(time));
      await seedCompletedDay(page, dateKey);
      await page.goto("/");
      await expect(page.locator(".summary-total strong")).toHaveText("300");
      await expect(page.locator(".next-beat strong")).toHaveText(countdown);
      await expect(
        page.getByText("Resets at 00:00 local time", { exact: true }),
      ).toBeVisible();
      await expect(page.locator(".summary-rounds")).toContainText(
        "ROUND 01 · EASY",
      );
      await expect(page.locator(".summary-rounds")).toContainText(
        "ROUND 02 · MEDIUM",
      );
      await expect(page.locator(".summary-rounds")).toContainText(
        "ROUND 03 · HARD",
      );
    });
  }
});
