import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AnalyzeResponse } from "@/api/schemas";
import { AnalyzeError } from "@/components/results/AnalyzeError";
import { CheckpointsList } from "@/components/results/CheckpointsList";
import { CompareTable } from "@/components/results/CompareTable";
import { EmptyState } from "@/components/results/EmptyState";
import { RecommendationBanner } from "@/components/results/RecommendationBanner";
import { RouteCard } from "@/components/results/RouteCard";
import { useViewStore } from "@/store/viewStore";

export function ResultsLoading() {
  return (
    <div className="space-y-3" data-testid="analyze-loading">
      <p className="text-sm text-text-muted">Analyzing routes and weather</p>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function ResultsPanel({
  data,
  error,
  loading,
  onRetry,
}: {
  data: AnalyzeResponse | undefined;
  error: unknown;
  loading: boolean;
  onRetry: () => void;
}) {
  const selectedRouteId = useViewStore((s) => s.selectedRouteId);
  const setSelectedRouteId = useViewStore((s) => s.setSelectedRouteId);
  const setHoveredRouteId = useViewStore((s) => s.setHoveredRouteId);
  const resultsTab = useViewStore((s) => s.resultsTab);
  const setResultsTab = useViewStore((s) => s.setResultsTab);

  if (loading) return <ResultsLoading />;
  if (error) {
    const errKey =
      error instanceof Error ? `${error.name}:${error.message}` : "error";
    return <AnalyzeError key={errKey} error={error} onRetry={onRetry} />;
  }
  if (!data) return <EmptyState />;

  const routes = [...data.routes].sort((a, b) => a.rank - b.rank);
  const selectedId =
    selectedRouteId && routes.some((r) => r.id === selectedRouteId)
      ? selectedRouteId
      : (data.recommendation.route_id ?? routes[0]?.id ?? null);
  const selectedRoute = routes.find((r) => r.id === selectedId) ?? routes[0];
  const departureLocal = selectedRoute?.checkpoints[0]?.eta_local ?? null;

  return (
    <div className="space-y-3" data-testid="results-panel">
      <RecommendationBanner data={data} />
      {data.input.interval_requested === "auto" ? (
        <p className="text-xs text-text-muted">
          Auto interval resolved to {data.input.interval_used_mi} mi
        </p>
      ) : null}

      <Tabs
        value={resultsTab}
        onValueChange={(v) =>
          setResultsTab(v as "routes" | "checkpoints" | "compare")
        }
      >
        <TabsList className="w-full">
          <TabsTrigger value="routes" className="flex-1">
            Routes
          </TabsTrigger>
          <TabsTrigger value="checkpoints" className="flex-1">
            Checkpoints
          </TabsTrigger>
          <TabsTrigger value="compare" className="flex-1">
            Compare
          </TabsTrigger>
        </TabsList>
        <TabsContent value="routes" className="mt-3 space-y-2">
          <div role="radiogroup" aria-label="Route options" className="space-y-2">
            {routes.map((route, index) => (
              <RouteCard
                key={route.id}
                route={route}
                index={index}
                selected={route.id === selectedId}
                departureLocal={departureLocal}
                onSelect={() => setSelectedRouteId(route.id)}
                onHover={(hover) =>
                  setHoveredRouteId(hover ? route.id : null)
                }
              />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="checkpoints" className="mt-3">
          {selectedRoute ? (
            <CheckpointsList
              route={selectedRoute}
              departureLocal={departureLocal}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="compare" className="mt-3">
          <CompareTable data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
