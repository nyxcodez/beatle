import { expect, test, type Page } from "@playwright/test";
import {
  audioProbe,
  completeListeningWithoutAudio,
  installAudioProbe,
  seedDailyRound,
} from "./helpers";

async function expectNoPageOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport);
}

async function expectFocusedPadVisible(page: Page, cellIndex: number) {
  const pad = page.locator(`[data-cell="${cellIndex}"]`);
  await expect(pad).toBeFocused();
  await expect
    .poll(
      async () =>
        pad.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const instrument = element
            .closest(".sequence-row")!
            .querySelector(".instrument-button")!
            .getBoundingClientRect();
          const viewport = element
            .closest(".sequencer-scroll")!
            .getBoundingClientRect();
          return (
            rect.left >= instrument.right - 1 &&
            rect.right <= viewport.right + 1
          );
        }),
      {
        message: `Focused pad ${cellIndex} should be fully visible beside the sticky instrument label`,
      },
    )
    .toBe(true);
}

for (const width of [320, 390]) {
  test(`the ${width}px layout keeps every grid pad reachable without page overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await seedDailyRound(page);
    await page.goto("/");
    await expectNoPageOverflow(page);

    const scrollRegion = page.getByRole("region", {
      name: "Rhythm grid. Scroll horizontally on small screens.",
    });
    expect(
      await scrollRegion.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(true);
    await scrollRegion.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await page
      .getByRole("button", { name: "Hi-hat, step 16", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Hi-hat, step 16", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    // Traverse all three rows from the far end: native focus scrolling must
    // account for the instrument labels that stay fixed above the pads.
    for (let index = 47; index >= 0; index -= 1) {
      await expectFocusedPadVisible(page, index);
      if (index > 0) await page.keyboard.press("ArrowLeft");
    }
    await expectNoPageOverflow(page);
    await page
      .getByRole("button", { name: "Submit beat", exact: true })
      .click();
    await expect(page.locator(".round-result")).toBeFocused();
    await expectNoPageOverflow(page);
  });
}

test("keyboard users can open instructions, remain inside the modal, and return to the opener", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("group", {
      name: /Your rhythm\. Use arrow keys to move, Enter to toggle a hit, and Space to play or pause\./,
    }),
  ).toBeVisible();
  const help = page.locator(".header-help");
  await help.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: /A little listening.*A lot of feeling/,
  });
  await expect(dialog).toBeVisible();
  const close = page.getByRole("button", {
    name: "Close instructions",
    exact: true,
  });
  await expect(close).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Let’s find that groove", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  // Chromium includes the native dialog container in reverse tab order.
  await page.keyboard.press("Shift+Tab");
  await expect(dialog).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(help).toBeFocused();
});

test("mode, pad, and solution controls expose state and preserve keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  const daily = page.getByRole("button", { name: "Daily beat", exact: true });
  const practice = page.getByRole("button", { name: "Practice", exact: true });
  await expect(daily).toHaveAttribute("aria-pressed", "true");
  await expect(practice).toHaveAttribute("aria-pressed", "false");
  await practice.focus();
  await page.keyboard.press("Enter");
  await expect(practice).toHaveAttribute("aria-pressed", "true");
  await expect(daily).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".pad:disabled")).toHaveCount(48);
  await expect(
    page.getByRole("button", { name: "Submit beat", exact: true }),
  ).toBeDisabled();
  await completeListeningWithoutAudio(page);

  const kick = page.getByRole("button", { name: "Kick, step 1", exact: true });
  await kick.focus();
  await expect(kick).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Enter");
  await expect(kick).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(kick).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("button", { name: "Snare, step 1", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");

  await page.getByRole("button", { name: "Submit beat", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".round-result")).toBeFocused();
  await expect(
    page.getByRole("button", { name: "The solution", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Your beat", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Your beat", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const submittedSnare = page.locator('[data-cell="16"]');
  await expect(submittedSnare).toHaveAttribute("aria-disabled", "true");
  await expect(submittedSnare).toHaveAttribute("aria-pressed", "true");
  await submittedSnare.focus();
  await page.keyboard.press("Enter");
  await expect(submittedSnare).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Another groove", exact: true })
    .click();
  await expect(page.locator("#game")).toBeFocused();
  await expect(page.locator(".pad:disabled")).toHaveCount(48);
  await expect(
    page.getByRole("progressbar", { name: "Loops completed" }),
  ).toHaveAttribute("aria-valuenow", "0");
});

test("reduced motion stops waveform animation and control transitions during playback", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Listen to the beat", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /Get ready/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Find the groove.", exact: true }),
  ).toBeVisible({ timeout: 6_000 });
  await expect(page.locator(".waveform-active")).toBeVisible();
  const styles = await page
    .locator(".waveform span")
    .first()
    .evaluate((element) => ({
      animation: getComputedStyle(element).animationName,
      transition: getComputedStyle(document.querySelector(".listen-button")!)
        .transitionDuration,
      scroll: getComputedStyle(document.documentElement).scrollBehavior,
    }));
  expect(styles).toEqual({
    animation: "none",
    transition: "0s",
    scroll: "auto",
  });
  await page
    .getByRole("button", { name: "Stop listening", exact: true })
    .click();
});

test("Space toggles playback without toggling focused pads and ignores repeated keys, text fields, and dialogs", async ({
  page,
}) => {
  await seedDailyRound(page);
  await page.goto("/");
  await installAudioProbe(page);
  const kick = page.getByRole("button", { name: "Kick, step 1", exact: true });
  await kick.focus();
  await page.keyboard.press("Enter");
  await expect(kick).toHaveAttribute("aria-pressed", "true");
  const focusedPad = page.getByRole("button", {
    name: "Snare, step 3",
    exact: true,
  });
  await focusedPad.focus();
  await page.keyboard.down("Space");
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.keyboard.down("Space");
  await page.keyboard.up("Space");
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".pad-playing")).toHaveCount(3, { timeout: 1_000 });
  await expect(focusedPad).toHaveAttribute("aria-pressed", "false");
  expect((await audioProbe(page)).plays).toHaveLength(1);
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".pad-playing")).toHaveCount(0);
  await expect(focusedPad).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  expect((await audioProbe(page)).plays).toHaveLength(2);

  await page.evaluate(() => {
    const input = document.createElement("input");
    input.id = "shortcut-input";
    input.setAttribute("aria-label", "Shortcut test text field");
    const editable = document.createElement("div");
    editable.id = "shortcut-editable";
    editable.contentEditable = "true";
    editable.setAttribute("role", "textbox");
    document.body.append(input, editable);
  });
  await page.locator("#shortcut-input").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#shortcut-input")).toHaveValue(" ");
  await page.locator("#shortcut-editable").focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  expect((await audioProbe(page)).plays).toHaveLength(2);
  await page.locator(".header-help").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.focus();
  await page.keyboard.press("Space");
  await expect(dialog).toBeVisible();
  expect((await audioProbe(page)).plays).toHaveLength(2);
  await expect(page.locator(".pad-playing")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await focusedPad.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  expect((await audioProbe(page)).plays).toHaveLength(3);
  await expect(focusedPad).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();
});
