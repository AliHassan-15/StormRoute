import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PlannerPage } from "@/pages/PlannerPage";
import { syncResolvedThemeFromSystem, useUiStore } from "@/store/uiStore";

const DesignSystemPage = lazy(async () => {
  const mod = await import("@/pages/DesignSystemPage");
  return { default: mod.DesignSystemPage };
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function ThemeBootstrap({ children }: { children: ReactNode }) {
  const hydrateTheme = useUiStore((state) => state.hydrateTheme);

  useEffect(() => {
    hydrateTheme();
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => syncResolvedThemeFromSystem();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [hydrateTheme]);

  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ThemeBootstrap>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<PlannerPage />} />
                <Route
                  path="/design"
                  element={
                    <Suspense
                      fallback={
                        <div className="flex min-h-dvh items-center justify-center bg-bg text-sm text-text-muted">
                          Loading design system…
                        </div>
                      }
                    >
                      <DesignSystemPage />
                    </Suspense>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
            <Toaster />
          </ThemeBootstrap>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
