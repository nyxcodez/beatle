import { expect, test, type Page } from '@playwright/test';
import { getDailyChallenge, getDailyStorageKey } from '../src/lib/daily';
import { TRACKS, type Puzzle } from '../src/lib/types';

const DATE_KEY = '2026-10-18';
const FIXED_TIME = new Date(`${DATE_KEY}T12:00:00.000Z`);

async function fillPuzzle(page: Page, puzzle: Puzzle) {
  for (const { id, label } of TRACKS) {
    for (let step = 0; step < 16; step += 1) {
      if (puzzle.pattern[id][step]) {
        await page.getByRole('button', { name: `${label}, step ${step + 1}`, exact: true }).click();
      }
    }
  }
}

async function savedDaily(page: Page, dateKey = DATE_KEY) {
  return page.evaluate((key) => localStorage.getItem(key), getDailyStorageKey(dateKey));
}

test('three sequential daily rounds score 300, persist, and remain immutable during review', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install({ time: FIXED_TIME });
  await page.goto('/');
  const { puzzles } = getDailyChallenge(DATE_KEY);

  await expect(page.getByRole('button', { name: 'Round 2, locked', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Round 3, locked', exact: true })).toBeDisabled();

  for (let index = 0; index < 3; index += 1) {
    await expect(page.locator('.round-board')).toHaveAttribute('aria-label', `Round ${index + 1}`);
    await fillPuzzle(page, puzzles[index]);
    await page.getByRole('button', { name: 'Submit beat', exact: true }).click();
    await expect(page.locator('.round-result')).toContainText('100%');
    await expect(page.getByRole('button', { name: 'The solution', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: 'Correct solution', exact: true })).toBeVisible();
    await expect(page.locator('.pad-mismatch')).toHaveCount(0);
    await expect(page.locator('.pad[aria-disabled="true"]')).toHaveCount(48);
    await expect(page.locator('.total-score strong')).toHaveText(new RegExp(`^${(index + 1) * 100}\\s*\\/\\s*300$`));
    if (index < 2) {
      await page.getByRole('button', { name: 'Next round', exact: true }).click();
      await expect(page.locator('.pad-active')).toHaveCount(0);
    }
  }

  await page.getByRole('button', { name: 'See daily results', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Perfectly in the pocket.', exact: true })).toBeVisible();
  await expect(page.locator('.summary-total strong')).toHaveText('300');
  const completedRecord = await savedDaily(page);
  expect(JSON.parse(completedRecord!).rounds.every((round: { submitted: boolean }) => round.submitted)).toBe(true);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Perfectly in the pocket.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review today’s rounds', exact: true }).click();
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: `Round ${index + 1}, complete`, exact: true }).click();
    await expect(page.locator('.round-result')).toContainText('100%');
    await page.getByRole('button', { name: 'Your beat', exact: true }).click();
    const pad = page.locator('.pad').first();
    const original = await pad.getAttribute('aria-pressed');
    await pad.focus();
    await page.keyboard.press('Space');
    await expect(pad).toHaveAttribute('aria-pressed', original!);
    await expect(page.getByRole('button', { name: 'Submit beat', exact: true })).toHaveCount(0);
    expect(await savedDaily(page)).toBe(completedRecord);
  }
  expect(errors).toEqual([]);
});

test('unfinished notes and the spent listening budget survive reload with unlimited editing time', async ({ page }) => {
  await page.clock.install({ time: FIXED_TIME });
  await page.goto('/');
  await page.getByRole('button', { name: 'Kick, step 3', exact: true }).click();
  await page.getByRole('button', { name: 'Snare, step 7', exact: true }).click();
  await page.getByRole('button', { name: 'Listen to the beat', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Find the groove.', exact: true })).toBeVisible({ timeout: 6_000 });
  await expect.poll(async () => Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeLessThan(30);
  await page.getByRole('button', { name: 'Stop listening', exact: true }).click();
  const remaining = await page.getByRole('progressbar').getAttribute('aria-valuenow');
  const record = JSON.parse((await savedDaily(page))!);
  expect(record.rounds[0].listeningSecondsUsed).toBeGreaterThan(0);
  expect(record.rounds[0].submitted).toBe(false);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Kick, step 3', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Snare, step 7', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', remaining!);
  await expect(page.getByRole('button', { name: 'Round 2, locked', exact: true })).toBeDisabled();
  await page.clock.fastForward(120_000);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', remaining!);
  await page.getByRole('button', { name: 'Hi-hat, step 16', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hi-hat, step 16', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Submit beat', exact: true })).toBeEnabled();
});

test('practice continues beyond three rounds and keeps daily attempts isolated', async ({ page }) => {
  await page.clock.install({ time: FIXED_TIME });
  await page.goto('/');
  await page.getByRole('button', { name: 'Kick, step 5', exact: true }).click();
  const dailyRecord = await savedDaily(page);
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page.getByText('Unlimited rounds', { exact: true })).toBeVisible();
  await expect(page.locator('.pad-active')).toHaveCount(0);

  for (let round = 1; round <= 4; round += 1) {
    await expect(page.locator('.round-board')).toHaveAttribute('aria-label', `Round ${round}`);
    await page.getByRole('button', { name: 'Snare, step 2', exact: true }).click();
    await page.getByRole('button', { name: 'Submit beat', exact: true }).click();
    await expect(page.getByRole('button', { name: 'The solution', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Another groove', exact: true }).click();
    await expect(page.locator('.pad-active')).toHaveCount(0);
    expect(await savedDaily(page)).toBe(dailyRecord);
  }
  await expect(page.locator('.round-board')).toHaveAttribute('aria-label', 'Round 5');
  await page.getByRole('button', { name: 'Daily beat', exact: true }).click();
  await expect(page.locator('.round-board')).toHaveAttribute('aria-label', 'Round 1');
  await expect(page.getByRole('button', { name: 'Kick, step 5', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pad-active')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Round 2, locked', exact: true })).toBeDisabled();
  expect(await savedDaily(page)).toBe(dailyRecord);
});

test('UTC midnight starts a fresh day and preserves the prior day record', async ({ page }) => {
  await page.clock.install({ time: new Date(`${DATE_KEY}T23:59:50.000Z`) });
  await page.goto('/');
  await page.getByRole('button', { name: 'Kick, step 1', exact: true }).click();
  const previousDay = await savedDaily(page);
  await page.clock.fastForward(11_000);

  await expect(page.getByRole('status')).toContainText('A new day, a new groove.');
  await expect(page.locator('.challenge-date')).toContainText('OCT 19');
  await expect(page.locator('.pad-active')).toHaveCount(0);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30');
  await expect(page.getByRole('button', { name: 'Round 2, locked', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Snare, step 8', exact: true }).click();
  expect(await savedDaily(page, DATE_KEY)).toBe(previousDay);
  const today = JSON.parse((await savedDaily(page, '2026-10-19'))!);
  expect(today.dateKey).toBe('2026-10-19');
  expect(today.rounds[0].pattern.snare[7]).toBe(true);
  expect(today.rounds[0].pattern.kick[0]).toBe(false);
});
