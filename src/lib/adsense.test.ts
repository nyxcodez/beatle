import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAdSense, readAdSenseConfig, requestAdSenseAd } from "./adsense";

const publisher = "ca-pub-1234567890123456";
const configured = {
  VITE_ADSENSE_CLIENT: publisher,
  VITE_ADSENSE_LEFT_SLOT: "1234567890",
  VITE_ADSENSE_RIGHT_SLOT: "0987654321",
};

describe("AdSense configuration", () => {
  it("uses the publisher and the slot for the requested side", () => {
    expect(readAdSenseConfig("left", configured)).toEqual({
      client: publisher,
      slot: "1234567890",
      testMode: false,
    });
    expect(readAdSenseConfig("right", configured)?.slot).toBe("0987654321");
  });

  it("does not configure a slot without a valid publisher and slot ID", () => {
    expect(readAdSenseConfig("left", {})).toBeNull();
    expect(
      readAdSenseConfig("left", { VITE_ADSENSE_CLIENT: publisher }),
    ).toBeNull();
    expect(
      readAdSenseConfig("left", {
        ...configured,
        VITE_ADSENSE_CLIENT: "ca-pub-1234",
      }),
    ).toBeNull();
    expect(
      readAdSenseConfig("left", {
        ...configured,
        VITE_ADSENSE_LEFT_SLOT: "not-a-slot",
      }),
    ).toBeNull();
    expect(
      readAdSenseConfig("right", {
        ...configured,
        VITE_ADSENSE_RIGHT_SLOT: undefined,
      }),
    ).toBeNull();
  });

  it("trims pasted IDs and enables test ads only with an explicit true flag", () => {
    expect(
      readAdSenseConfig("left", {
        ...configured,
        VITE_ADSENSE_CLIENT: ` ${publisher} `,
        VITE_ADSENSE_LEFT_SLOT: " 1234567890 ",
        VITE_ADSENSE_TEST_MODE: "true",
      }),
    ).toEqual({ client: publisher, slot: "1234567890", testMode: true });
    for (const value of [undefined, "false", "on", "TRUE"]) {
      expect(
        readAdSenseConfig("left", {
          ...configured,
          VITE_ADSENSE_TEST_MODE: value,
        })?.testMode,
      ).toBe(false);
    }
  });
});

interface FakeScript {
  id?: string;
  async?: boolean;
  crossOrigin?: string;
  src?: string;
  onload?: () => void;
  onerror?: () => void;
}

describe("AdSense script and ad requests", () => {
  let scripts: FakeScript[];
  let browser: {
    adsbygoogle?: { push: (ad: Record<string, never>) => unknown };
  };

  beforeEach(() => {
    scripts = [];
    browser = {};
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", {
      createElement: () => ({}),
      head: { appendChild: (script: FakeScript) => scripts.push(script) },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("loads the asynchronous Google script once for concurrent callers", async () => {
    const first = loadAdSense(publisher);
    const second = loadAdSense(publisher);
    expect(second).toBe(first);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatchObject({
      id: "beatle-adsense-script",
      async: true,
      crossOrigin: "anonymous",
      src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisher}`,
    });
    scripts[0].onload?.();
    await first;
    expect(loadAdSense(publisher)).toBe(first);
    expect(scripts).toHaveLength(1);
  });

  it("retains a failed script result rather than retrying blocked ads", async () => {
    const request = loadAdSense(publisher);
    const rejected = expect(request).rejects.toThrow("could not load");
    scripts[0].onerror?.();
    await rejected;
    expect(loadAdSense(publisher)).toBe(request);
    expect(scripts).toHaveLength(1);
  });

  it("rejects invalid or conflicting publishers without loading more scripts", async () => {
    await expect(loadAdSense("invalid")).rejects.toThrow("Invalid");
    expect(scripts).toHaveLength(0);
    const request = loadAdSense(publisher);
    await expect(loadAdSense("ca-pub-9999999999999999")).rejects.toThrow(
      "already loaded",
    );
    expect(scripts).toHaveLength(1);
    scripts[0].onload?.();
    await request;
  });

  it("queues each slot once and leaves slots already handled by Google alone", () => {
    const push = vi.fn();
    browser.adsbygoogle = { push };
    const left = { dataset: {} } as HTMLElement;
    const right = { dataset: {} } as HTMLElement;
    const initialized = {
      dataset: { adsbygoogleStatus: "done" },
    } as unknown as HTMLElement;

    expect(requestAdSenseAd(left)).toBe(true);
    expect(requestAdSenseAd(left)).toBe(false);
    expect(requestAdSenseAd(right)).toBe(true);
    expect(requestAdSenseAd(initialized)).toBe(false);
    expect(push.mock.calls).toEqual([[{}], [{}]]);
  });

  it("does not retry a slot when Google's request throws", () => {
    const push = vi.fn(() => {
      throw new Error("Request blocked");
    });
    browser.adsbygoogle = { push };
    const slot = { dataset: {} } as HTMLElement;
    expect(() => requestAdSenseAd(slot)).toThrow("Request blocked");
    expect(requestAdSenseAd(slot)).toBe(false);
    expect(push).toHaveBeenCalledTimes(1);
  });
});
