import * as React from "react";

import { ApiError, friendlyErrorMessage } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { RATE_LIMIT_DEFAULT_S } from "@/lib/constants";

function rateLimitWaitSeconds(error: unknown): number {
  if (!(error instanceof ApiError) || error.code !== "UPSTREAM_RATE_LIMIT") {
    return 0;
  }
  return error.retryAfterS ?? RATE_LIMIT_DEFAULT_S;
}

export function AnalyzeError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const code = error instanceof ApiError ? error.code : "INTERNAL";
  const message = friendlyErrorMessage(error);
  const initialWait = rateLimitWaitSeconds(error);
  const [secondsLeft, setSecondsLeft] = React.useState(initialWait);

  React.useEffect(() => {
    if (initialWait <= 0) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [initialWait]);

  const rateLimited = code === "UPSTREAM_RATE_LIMIT";
  const canRetry = !rateLimited || secondsLeft <= 0;

  return (
    <div
      className="space-y-3 rounded-[var(--radius-control)] border border-border bg-surface-raised/50 p-3"
      role="alert"
      data-testid="analyze-error"
      data-error-code={code}
    >
      <div>
        <p className="text-sm font-semibold text-text">Could not analyze routes</p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">{message}</p>
        {code === "NO_ROUTE" ? (
          <p className="mt-2 text-xs text-text-muted">
            Tip: choose places from the suggestion list, keep origin and destination at
            least a mile apart, and avoid free-typed addresses that did not resolve.
          </p>
        ) : null}
        {rateLimited && secondsLeft > 0 ? (
          <p
            className="mt-2 font-mono text-xs tabular-nums text-text"
            data-testid="rate-limit-countdown"
            aria-live="polite"
          >
            Retry available in {secondsLeft}s
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        size="sm"
        className="min-h-11"
        onClick={onRetry}
        disabled={!canRetry}
      >
        {rateLimited && secondsLeft > 0 ? `Wait ${secondsLeft}s` : "Retry"}
      </Button>
    </div>
  );
}
