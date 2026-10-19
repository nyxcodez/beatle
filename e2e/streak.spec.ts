import { expect, test, type Page } from "@playwright/test";
import {
  createDailyProgress,
  getDailyStorageKey,
  type DailyProgress,
} from "../src/lib/daily";
import {
  completeListeningWithoutAudio,
  savedDaily,
  seedDailyRound,
} from "./helpers";

const TODAY = "2026-10-19";

function progressWithSubmissions(dateKey: string, submittedRounds = 3) {
  const progress = createDailyProgress(dateKey);
  progress.rounds.forEach((round, index) => {
    if (index <= submittedRounds) {
      round.referenceEnded = true;
      round.completedLoops = 1;
    }
    round.submitted = index < submittedRounds;
  });
  return progress;
}

async function seedRecords(page: Page, records: DailyProgress[]) {
  await page.addInitScript(
    (records) => {
      for (const { key, value } of records) {
        if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      }
    },
    records.map((progress) => ({
      key: getDailyStorageKey(progress.dateKey),
      value: JSON.stringify(progress),
    })),
  );
}

test.describe("daily streak", () => {
  test.use({ timezoneId: "Europe/Bucharest" });

  test("finishing all three rounds extends the streak once, including zero-score days, and survives results, reload, and review", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(`${TODAY}T09:00:00Z`) });
    await seedRecords(page, [
      progressWithSubmissions("2026-10-17"),
      progressWithSubmissions("2026-10-18"),
      progressWithSubmissions(TODAY, 2),
    ]);
    await page.goto("/");
    const streak = page.getByRole("status", {
      name: "Daily streak",
      exact: true,
    });
    await expect(streak.locator(".streak-count")).toHaveText("2");
    await expect(streak).toHaveAttribute("data-completed", "false");
    await expect(page.locator(".round-board")).toHaveAttribute(
      "aria-label",
      "Round 3",
    );
    await page
      .getByRole("button", { name: "Submit beat", exact: true })
      .click();
    await expect(page.locator(".round-result")).toContainText("0% accuracy");
    await expect(streak.locator(".streak-count")).toHaveText("3");
    await expect(streak).toHaveAttribute("data-completed", "true");
    await expect(streak).toContainText("days");

    await page
      .getByRole("button", { name: "See daily results", exact: true })
      .click();
    await expect(page.locator(".summary-streak")).toContainText("3");
    await expect(page.locator(".summary-total strong")).toHaveText("0");
    const completedRecord = await savedDaily(page, TODAY);
    await page.reload();
    await expect(streak.locator(".streak-count")).toHaveText("3");
    await expect(page.locator(".summary-streak")).toContainText("3");

    await page.setViewportSize({ width: 320, height: 900 });
    await expect(streak).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page
      .getByRole("button", { name: "Review today’s rounds", exact: true })
      .click();
    await expect(streak.locator(".streak-count")).toHaveText("3");
    await page
      .getByRole("button", { name: "Round 3, complete", exact: true })
      .click();
    await expect(streak.locator(".streak-count")).toHaveText("3");
    await expect(
      page.getByRole("button", { name: "Submit beat", exact: true }),
    ).toHaveCount(0);
    expect(await savedDaily(page, TODAY)).toBe(completedRecord);
  });

  test("partial daily progress and completed practice rounds do not extend a streak", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date(`${TODAY}T09:00:00Z`) });
    await seedDailyRound(page, TODAY);
    await seedRecords(page, [progressWithSubmissions("2026-10-18")]);
    await page.goto("/");
    await expect(page.locator(".daily-streak .streak-count")).toHaveText("1");
    await expect(page.locator(".daily-streak strong")).toHaveText("1 day");
    await page
      .getByRole("button", { name: "Submit beat", exact: true })
      .click();
    await expect(page.locator(".daily-streak .streak-count")).toHaveText("1");
    await expect(page.locator(".daily-streak")).toHaveAttribute(
      "data-completed",
      "false",
    );
    const partialRecord = await savedDaily(page, TODAY);

    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await expect(page.locator(".daily-streak")).toHaveCount(0);
    await expect(page.locator(".summary-streak")).toHaveCount(0);
    for (let round = 0; round < 3; round += 1) {
      await completeListeningWithoutAudio(page);
      await page
        .getByRole("button", { name: "Submit beat", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Another groove", exact: true })
        .click();
    }
    await page.getByRole("button", { name: "Daily beat", exact: true }).click();
    await expect(page.locator(".daily-streak .streak-count")).toHaveText("1");
    expect(await savedDaily(page, TODAY)).toBe(partialRecord);
  });

  test("keeps yesterday's streak at local midnight and resets after a whole missed local day", async ({
    page,
  }) => {
    // Bucharest is UTC+3 here: the first rollover is at 21:00 UTC.
    await page.clock.install({ time: new Date("2026-10-19T20:59:50Z") });
    await seedRecords(page, [
      progressWithSubmissions("2026-10-18"),
      progressWithSubmissions(TODAY),
    ]);
    await page.goto("/");
    await expect(page.locator(".daily-streak .streak-count")).toHaveText("2");
    const completedRecord = await savedDaily(page, TODAY);

    await page.clock.fastForward(11_000);
    await expect(page.locator(".challenge-date")).toContainText(
      "OCT 20 · LOCAL",
    );
    await expect(page.locator(".daily-streak .streak-count")).toHaveText("2");
    await expect(
      page.getByRole("button", { name: "Submit beat", exact: true }),
    ).toBeDisabled();

    await page.clock.fastForward(24 * 60 * 60 * 1000);
    await expect(page.locator(".challenge-date")).toContainText(
      "OCT 21 · LOCAL",
    );
    await expect(page.locator(".daily-streak .streak-count")).toHaveText("0");
    expect(await savedDaily(page, TODAY)).toBe(completedRecord);
    await page.reload();
    await expect(page.locator(".daily-streak .streak-count")).toHaveText("0");
  });
});
