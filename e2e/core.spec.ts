import { expect, test } from '@playwright/test';
import { getDailyChallenge } from '../src/lib/daily';
import { TRACKS } from '../src/lib/types';

test('a complete core round: listen, edit, preview, submit, and reveal the solution', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const dateKey = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  const puzzle = getDailyChallenge(dateKey).puzzles[0];
  await expect(page.getByRole('heading', { name: 'Find your rhythm.' })).toBeVisible();
  await expect(page.locator('.pad')).toHaveCount(48);
  await expect(page.locator('.pad-active')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play my beat', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Listen to the beat', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Get ready/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Find the groove.' })).toBeVisible({ timeout: 6000 });
  await expect.poll(async () => Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeLessThan(30);
  await page.getByRole('button', { name: 'Stop listening', exact: true }).click();
  const timeLeft = await page.getByRole('progressbar').getAttribute('aria-valuenow');
  await page.waitForTimeout(400);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', timeLeft!);

  const firstPad = page.getByRole('button', { name: 'Kick, step 1', exact: true });
  await firstPad.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Kick, step 2', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Kick, step 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  for (const track of TRACKS) {
    for (let step = 0; step < 16; step++) {
      if (puzzle.pattern[track.id][step]) await page.getByRole('button', { name: `${track.label}, step ${step + 1}`, exact: true }).click();
    }
  }
  await page.getByRole('button', { name: 'Play my beat', exact: true }).click();
  await expect(page.getByRole('button', { name: /Count-in/ })).toBeVisible();
  await page.getByRole('button', { name: /Count-in/ }).click();
  await page.getByRole('button', { name: 'Submit beat', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('100%');
  await expect(page.getByRole('button', { name: 'The solution', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pad-mismatch')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play the solution', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});
