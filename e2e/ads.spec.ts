import { expect, test, type Page } from "@playwright/test";
import { seedDailyRound } from "./helpers";

const CLIENT = "ca-pub-1234567890123456";
const LEFT_SLOT = "1234567890";
const RIGHT_SLOT = "0987654321";
const SDK_URL =
  /^https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js(?:\?|$)/;

interface AdProbe {
  scriptLoads: number;
  initializations: { client: string; slot: string; test: string | null }[];
}

async function configureAdSense(page: Page) {
  // Supply public Vite settings in the served module, without changing the
  // developer's environment or making requests to a real advertising account.
  await page.route(/\/src\/lib\/adsense\.ts(?:\?|$)/, async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const envAssignment = /import\.meta\.env\s*=\s*[^\n]*;\n/;
    expect(source).toMatch(envAssignment);
    const settings = {
      VITE_ADSENSE_CLIENT: CLIENT,
      VITE_ADSENSE_LEFT_SLOT: LEFT_SLOT,
      VITE_ADSENSE_RIGHT_SLOT: RIGHT_SLOT,
      VITE_ADSENSE_TEST_MODE: "true",
    };
    await route.fulfill({
      response,
      body: source.replace(
        envAssignment,
        (assignment) =>
          `${assignment}Object.assign(import.meta.env, ${JSON.stringify(settings)});\n`,
      ),
    });
  });
  await page.addInitScript(() => {
    (window as unknown as { beatleAdProbe: AdProbe }).beatleAdProbe = {
      scriptLoads: 0,
      initializations: [],
    };
  });
}

async function mockAdSense(page: Page) {
  const requests: string[] = [];
  await page.route(SDK_URL, async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      contentType: "application/javascript",
      body: `(() => {
        const probe = window.beatleAdProbe;
        probe.scriptLoads += 1;
        const initialize = () => {
          const unit = [...document.querySelectorAll('ins.adsbygoogle')]
            .find(element => !element.hasAttribute('data-adsbygoogle-status'));
          if (!unit) throw new Error('Ad unit initialized more than once');
          probe.initializations.push({
            client: unit.getAttribute('data-ad-client'),
            slot: unit.getAttribute('data-ad-slot'),
            test: unit.getAttribute('data-adtest'),
          });
          unit.setAttribute('data-adsbygoogle-status', 'done');
          unit.setAttribute('data-ad-status', 'filled');
        };
        const pending = Array.isArray(window.adsbygoogle) ? [...window.adsbygoogle] : [];
        window.adsbygoogle = { push: initialize };
        pending.forEach(initialize);
      })();`,
    });
  });
  return requests;
}

async function adProbe(page: Page): Promise<AdProbe> {
  return page.evaluate(
    () => (window as unknown as { beatleAdProbe: AdProbe }).beatleAdProbe,
  );
}

async function expectNoPageOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport);
}

async function expectDesktopPlacement(page: Page) {
  const left = page.getByRole("complementary", {
    name: "Left advertisement",
    exact: true,
  });
  const right = page.getByRole("complementary", {
    name: "Right advertisement",
    exact: true,
  });
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  expect(
    await page
      .locator(".ad-layout")
      .evaluate((layout) => [...layout.children].map((child) => child.tagName)),
  ).toEqual(["ASIDE", "MAIN", "ASIDE"]);
  const leftBounds = await left.boundingBox();
  const mainBounds = await page.locator("main").boundingBox();
  const rightBounds = await right.boundingBox();
  expect(leftBounds!.x + leftBounds!.width).toBeLessThan(mainBounds!.x);
  expect(mainBounds!.x + mainBounds!.width).toBeLessThan(rightBounds!.x);
  for (const rail of [left, right]) {
    const content = await rail.locator(".ad-content").boundingBox();
    expect(content!.width).toBe(160);
    expect(content!.height).toBe(600);
  }
  const grid = await page.locator(".sequencer-scroll").evaluate((element) => ({
    content: element.scrollWidth,
    viewport: element.clientWidth,
  }));
  expect(grid.content).toBeLessThanOrEqual(grid.viewport);
  const firstPad = await page
    .getByRole("button", { name: "Kick, step 1", exact: true })
    .boundingBox();
  const lastPad = await page
    .getByRole("button", { name: "Kick, step 16", exact: true })
    .boundingBox();
  expect(firstPad!.y).toBe(lastPad!.y);
  expect(lastPad!.x).toBeGreaterThan(firstPad!.x);
  await expectNoPageOverflow(page);
}

test("desktop advertising spaces flank the game without shrinking the sixteen-step grid or duplicating on navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const providerRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("googlesyndication.com"))
      providerRequests.push(request.url());
  });
  await seedDailyRound(page);
  await page.goto("/");
  await expect(page.locator(".ad-placeholder")).toHaveCount(2);
  await expect(page.locator(".ad-placeholder").first()).toContainText(
    "Ad space",
  );
  await expectDesktopPlacement(page);
  const positions = await page.locator(".ad-rail").evaluateAll((rails) =>
    rails.map((rail) => ({
      x: rail.getBoundingClientRect().x,
      width: rail.getBoundingClientRect().width,
    })),
  );
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.locator(".ad-rail")).toHaveCount(2);
  await expect(page.locator(".pad:disabled")).toHaveCount(48);
  await expectDesktopPlacement(page);
  expect(
    await page.locator(".ad-rail").evaluateAll((rails) =>
      rails.map((rail) => ({
        x: rail.getBoundingClientRect().x,
        width: rail.getBoundingClientRect().width,
      })),
    ),
  ).toEqual(positions);
  await page.getByRole("button", { name: "Daily beat", exact: true }).click();
  await expect(page.locator(".ad-placeholder")).toHaveCount(2);
  expect(providerRequests).toEqual([]);
});

test("configured ads stay hidden and make no provider requests on phones and tablets while the game remains playable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await configureAdSense(page);
  const requests = await mockAdSense(page);
  await seedDailyRound(page);
  await page.goto("/");
  const kick = page.getByRole("button", { name: "Kick, step 1", exact: true });
  await kick.click();
  await expect(kick).toHaveAttribute("aria-pressed", "true");
  for (const width of [320, 390, 1024, 1279]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".ad-rail-left")).toBeHidden();
    await expect(page.locator(".ad-rail-right")).toBeHidden();
    await expect(page.locator("#beatle-adsense-script")).toHaveCount(0);
    await expectNoPageOverflow(page);
    expect(requests).toEqual([]);
    expect((await adProbe(page)).initializations).toEqual([]);
  }
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(page.locator(".pad:disabled")).toHaveCount(48);
  await page.getByRole("button", { name: "Daily beat", exact: true }).click();
  await expect(kick).toHaveAttribute("aria-pressed", "true");
  expect(requests).toEqual([]);
});

test("AdSense loads once and initializes each configured unit once across Strict Mode, navigation, and resizing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await configureAdSense(page);
  const requests = await mockAdSense(page);
  await seedDailyRound(page);
  await page.goto("/");
  await expect
    .poll(async () => (await adProbe(page)).initializations.length)
    .toBe(2);
  await expectDesktopPlacement(page);
  const expected = [
    { client: CLIENT, slot: LEFT_SLOT, test: "on" },
    { client: CLIENT, slot: RIGHT_SLOT, test: "on" },
  ];
  expect((await adProbe(page)).initializations).toEqual(expected);
  await expect(page.locator("ins.adsbygoogle")).toHaveCount(2);
  await expect(page.locator("#beatle-adsense-script")).toHaveCount(1);
  expect(requests).toHaveLength(1);
  expect(new URL(requests[0]).searchParams.get("client")).toBe(CLIENT);

  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page.getByRole("button", { name: "Daily beat", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await expectDesktopPlacement(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator(".ad-rail-left")).toBeHidden();
  await expect(page.locator(".ad-rail-right")).toBeHidden();
  await expectNoPageOverflow(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expectDesktopPlacement(page);
  expect(await adProbe(page)).toEqual({
    scriptLoads: 1,
    initializations: expected,
  });
  expect(requests).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("a blocked AdSense script falls back to both reserved spaces without interrupting a round", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await configureAdSense(page);
  let attemptedLoads = 0;
  await page.route(SDK_URL, async (route) => {
    attemptedLoads += 1;
    await route.abort("blockedbyclient");
  });
  await seedDailyRound(page);
  await page.goto("/");
  await expect(page.locator(".ad-placeholder")).toHaveCount(2);
  await expectDesktopPlacement(page);
  expect(attemptedLoads).toBe(1);
  await page.getByRole("button", { name: "Kick, step 1", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Submit beat", exact: true }).click();
  await expect(page.locator(".round-result")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play original", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".ad-placeholder")).toHaveCount(2);
  expect(errors).toEqual([]);
});
