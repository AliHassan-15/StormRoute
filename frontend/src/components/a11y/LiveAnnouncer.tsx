import { useMemo } from "react";

import { useResultsStore } from "@/store/resultsStore";

/** Polite live region for analyze results announcements. */
export function LiveAnnouncer() {
  const data = useResultsStore((s) => s.data);

  const message = useMemo(() => {
    if (!data) return "";
    const count = data.routes.length;
    const rec = data.routes.find((r) => r.id === data.recommendation.route_id);
    const label = rec?.label ?? data.recommendation.route_id;
    if (data.recommendation.all_blocked || !label) {
      return `${count} route${count === 1 ? "" : "s"} found. All routes are blocked for travel.`;
    }
    return `${count} route${count === 1 ? "" : "s"} found. ${label} recommended.`;
  }, [data]);

  return (
    <div
      className="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="live-announcer"
    >
      {message}
    </div>
  );
}
