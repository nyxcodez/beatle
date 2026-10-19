import { useEffect, useRef, useState } from "react";
import {
  loadAdSense,
  readAdSenseConfig,
  requestAdSenseAd,
  type AdPosition,
} from "../lib/adsense";

export default function AdSlot({ position }: { position: AdPosition }) {
  const [config] = useState(() => readAdSenseConfig(position));
  const [failed, setFailed] = useState(false);
  const adRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    if (!config || failed) return;

    let cancelled = false;
    const desktop = window.matchMedia("(min-width: 1280px)");
    const initialize = () => {
      if (!desktop.matches) return;
      void loadAdSense(config.client)
        .then(() => {
          if (cancelled || !desktop.matches || !adRef.current) return;
          requestAdSenseAd(adRef.current);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    };

    initialize();
    desktop.addEventListener("change", initialize);
    return () => {
      cancelled = true;
      desktop.removeEventListener("change", initialize);
    };
  }, [config, failed]);

  return (
    <aside
      className={`ad-rail ad-rail-${position}`}
      aria-label={`${position === "left" ? "Left" : "Right"} advertisement`}
    >
      <span className="ad-label">ADVERTISEMENT</span>
      <div className="ad-content">
        {config && !failed ? (
          <ins
            ref={adRef}
            className="adsbygoogle"
            style={{ display: "block", width: 160, height: 600 }}
            data-ad-client={config.client}
            data-ad-slot={config.slot}
            data-adtest={config.testMode ? "on" : undefined}
          />
        ) : (
          <div className="ad-placeholder">
            <span>Ad space</span>
            <small>160 × 600</small>
          </div>
        )}
      </div>
    </aside>
  );
}
