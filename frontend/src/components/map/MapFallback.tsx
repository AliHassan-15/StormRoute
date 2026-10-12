import { AlertTriangle } from "lucide-react";

export function MapFallback({
  reason,
}: {
  reason: "webgl" | "token" | "error";
}) {
  const copy =
    reason === "webgl"
      ? "This browser cannot render the map (WebGL is unavailable). Try another browser or enable hardware acceleration."
      : reason === "token"
        ? "Mapbox token is missing, invalid, or expired. Set a valid VITE_MAPBOX_TOKEN (public pk. token) in the frontend environment and reload."
        : "The map failed to load. Check your network connection and Mapbox token, then reload.";

  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-bg p-6"
      data-testid="map-fallback"
      data-reason={reason}
      role="alert"
    >
      <div className="max-w-md rounded-[var(--radius-panel)] border border-border bg-surface p-6 shadow-panel">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-risk-high" />
          <div>
            <h2 className="text-sm font-semibold text-text">Map unavailable</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{copy}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
