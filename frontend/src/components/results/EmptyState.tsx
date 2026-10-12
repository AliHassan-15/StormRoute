/** Minimal pre-analysis placeholder — keeps the form as the single focus. */
export function EmptyState() {
  return (
    <div
      className="mt-auto pt-6 text-center"
      data-testid="results-empty"
    >
      <p className="text-xs leading-relaxed text-text-muted">
        Results appear here after you analyze a route.
      </p>
    </div>
  );
}
