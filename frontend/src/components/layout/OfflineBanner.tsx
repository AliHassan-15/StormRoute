import * as React from "react";

import { Z_BANNER } from "@/lib/constants";

/** Polite banner when the browser reports offline. */
export function OfflineBanner() {
  const [offline, setOffline] = React.useState(
    () => typeof navigator !== "undefined" && !navigator.onLine,
  );

  React.useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="pointer-events-auto fixed inset-x-0 top-0 flex justify-center px-4 pt-3"
      style={{ zIndex: Z_BANNER }}
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
    >
      <div className="rounded-[var(--radius-control)] border border-border bg-surface px-4 py-2 text-sm text-text shadow-soft">
        You appear to be offline. StormRoute needs a network for maps, weather,
        and routing.
      </div>
    </div>
  );
}
