import { expect, test, type Page } from '@playwright/test';
import { createDailyProgress, getUTCDateKey, saveDailyProgress } from '../src/lib/daily';

/** Use the production validator to seed a nearly-used allowance without faking audio time. */
async function seedListeningAllowance(page: Page, secondsUsed: number): Promise<string> {
  const progress = createDailyProgress(getUTCDateKey());
  progress.rounds[0].listeningSecondsUsed = secondsUsed;
  progress.rounds[0].pattern.kick[0] = true;
  let savedRecord: { key: string; value: string } | undefined;
  expect(saveDailyProgress(progress, {
    setItem: (key, value) => { savedRecord = { key, value }; },
  })).toBe(true);
  if (!savedRecord) throw new Error('Could not prepare valid daily progress.');
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), savedRecord);
  return savedRecord.key;
}

async function secondsUsed(page: Page, key: string): Promise<number> {
  return page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)!).rounds[0].listeningSecondsUsed, key);
}

async function startTargetLoop(page: Page) {
  await page.getByRole('button', { name: 'Listen to the beat', exact: true }).click();
  // Waiting for count-in first avoids matching the brief pre-count-in loading state.
  await expect(page.getByRole('heading', { name: 'Get ready… 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Find the groove.' })).toBeVisible({ timeout: 6_000 });
  await expect(page.locator('.pad-playing')).toHaveCount(3);
}

test('count-in and own beat are free; target listening pauses, resumes, and stops for help', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const storageKey = await seedListeningAllowance(page, 27);
  await page.goto('/');
  const clock = page.getByRole('progressbar', { name: 'Listening time remaining' });
  await expect(clock).toHaveAttribute('aria-valuenow', '3');

  await page.getByRole('button', { name: 'Listen to the beat', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Get ready… 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop listening', exact: true }).click();
  expect(await secondsUsed(page, storageKey)).toBe(27);
  await expect(page.locator('.pad-playing')).toHaveCount(0);

  await page.getByRole('button', { name: 'Play my beat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Count-in · 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop my beat', exact: true })).toBeVisible({ timeout: 6_000 });
  await expect(page.locator('.pad-playing')).toHaveCount(3);
  await page.waitForTimeout(300);
  expect(await secondsUsed(page, storageKey)).toBe(27);
  await page.getByRole('button', { name: 'Stop my beat', exact: true }).click();

  await startTargetLoop(page);
  await expect.poll(() => secondsUsed(page, storageKey)).toBeGreaterThan(27.25);
  await page.getByRole('button', { name: 'Stop listening', exact: true }).click();
  const pausedAt = await secondsUsed(page, storageKey);
  expect(pausedAt).toBeGreaterThan(27.25);
  expect(pausedAt).toBeLessThan(30);
  await page.waitForTimeout(350);
  expect(await secondsUsed(page, storageKey)).toBe(pausedAt);

  await startTargetLoop(page);
  await expect.poll(() => secondsUsed(page, storageKey)).toBeGreaterThan(pausedAt + 0.25);
  await page.locator('.header-help').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const stoppedForHelpAt = await secondsUsed(page, storageKey);
  expect(stoppedForHelpAt).toBeGreaterThan(pausedAt);
  await page.waitForTimeout(350);
  expect(await secondsUsed(page, storageKey)).toBe(stoppedForHelpAt);
  await page.getByRole('button', { name: 'Close instructions', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Listen to the beat', exact: true })).toBeEnabled();
  await expect(page.locator('.pad-playing')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the final listening second expires; editing and submitted solution replays remain available', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const storageKey = await seedListeningAllowance(page, 29);
  await page.goto('/');
  await startTargetLoop(page);
  await expect(page.getByRole('heading', { name: 'Now, trust your ears.' })).toBeVisible({ timeout: 3_000 });
  await expect(page.getByRole('progressbar', { name: 'Listening time remaining' })).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByRole('button', { name: 'Listen to the beat', exact: true })).toBeDisabled();
  await expect(page.locator('.pad-playing')).toHaveCount(0);
  expect(await secondsUsed(page, storageKey)).toBe(30);

  const pad = page.getByRole('button', { name: 'Kick, step 2', exact: true });
  await pad.click();
  await expect(pad).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Submit beat', exact: true }).click();
  await expect(page.getByRole('button', { name: 'The solution', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Play the solution', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Get ready… 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Find the groove.' })).toBeVisible({ timeout: 6_000 });
  // Play longer than the previously remaining one second, using the real AudioContext.
  await page.waitForTimeout(1_300);
  await expect(page.getByRole('button', { name: 'Stop listening', exact: true })).toBeEnabled();
  await expect(page.locator('.pad-playing')).toHaveCount(3);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  expect(await secondsUsed(page, storageKey)).toBe(30);
  await page.getByRole('button', { name: 'Stop listening', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play the solution', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});
