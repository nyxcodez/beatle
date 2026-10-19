export type AdPosition = "left" | "right";

export interface AdSenseConfig {
  client: string;
  slot: string;
  testMode: boolean;
}

interface AdSenseEnvironment {
  [key: string]: unknown;
  VITE_ADSENSE_CLIENT?: string;
  VITE_ADSENSE_LEFT_SLOT?: string;
  VITE_ADSENSE_RIGHT_SLOT?: string;
  VITE_ADSENSE_TEST_MODE?: string;
}

interface AdSenseScriptState {
  client: string;
  promise: Promise<void>;
}

type AdSenseWindow = Window & {
  adsbygoogle?: { push: (ad: Record<string, never>) => unknown };
  __beatleAdSenseScript?: AdSenseScriptState;
};

const publisherPattern = /^ca-pub-\d{16}$/;
const slotPattern = /^\d{1,20}$/;
const requestedSlots = new WeakSet<HTMLElement>();

export function readAdSenseConfig(
  position: AdPosition,
  environment: AdSenseEnvironment = import.meta.env,
): AdSenseConfig | null {
  const client = environment.VITE_ADSENSE_CLIENT?.trim() ?? "";
  const slot =
    (position === "left"
      ? environment.VITE_ADSENSE_LEFT_SLOT
      : environment.VITE_ADSENSE_RIGHT_SLOT
    )?.trim() ?? "";

  if (!publisherPattern.test(client) || !slotPattern.test(slot)) return null;

  return {
    client,
    slot,
    testMode: environment.VITE_ADSENSE_TEST_MODE === "true",
  };
}

/** Keep the script for the lifetime of the page, including React remounts. */
export function loadAdSense(client: string): Promise<void> {
  if (!publisherPattern.test(client)) {
    return Promise.reject(new Error("Invalid AdSense publisher."));
  }
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("AdSense needs a browser."));
  }

  const browser = window as AdSenseWindow;
  const existing = browser.__beatleAdSenseScript;
  if (existing) {
    return existing.client === client
      ? existing.promise
      : Promise.reject(new Error("An AdSense publisher is already loaded."));
  }

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "beatle-adsense-script";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("AdSense could not load."));
    document.head.appendChild(script);
  });

  browser.__beatleAdSenseScript = { client, promise };
  return promise;
}

/** Reserve the slot before pushing so failed requests are never retried. */
export function requestAdSenseAd(element: HTMLElement): boolean {
  if (requestedSlots.has(element) || element.dataset.adsbygoogleStatus) {
    return false;
  }
  requestedSlots.add(element);

  const browser = window as AdSenseWindow;
  const queue =
    browser.adsbygoogle ??
    (browser.adsbygoogle = [] as Record<string, never>[]);
  queue.push({});
  return true;
}
