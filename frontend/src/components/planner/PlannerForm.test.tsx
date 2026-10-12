import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalyzeMutation } from "@/api/hooks";
import * as hooks from "@/api/hooks";
import { PlannerForm } from "@/components/planner/PlannerForm";
import { usePlanStore } from "@/store/planStore";

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

function mockAnalyze(partial: Partial<AnalyzeMutation> = {}): AnalyzeMutation {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    cancel: vi.fn(),
    isPending: false,
    ...partial,
  };
}

describe("PlannerForm", () => {
  beforeEach(() => {
    usePlanStore.setState({
      origin: null,
      destination: null,
      departure: null,
      loadLb: 0,
      interval: "auto",
      formCollapsed: false,
    });
    vi.spyOn(hooks, "useMeta").mockReturnValue({
      data: {
        levels: [],
        thresholds: {
          wind_mph: { bands: [] },
          rain_in_hr: { bands: [] },
          snow_in_hr: { bands: [] },
        },
        load_rules: [],
        units: {},
        version: "1",
      },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof hooks.useMeta>);
  });

  it("disables submit until all fields are valid", async () => {
    const analyze = mockAnalyze();
    wrap(
      <PlannerForm
        analyze={analyze}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: /analyze routes/i });
    expect(button).toBeDisabled();

    usePlanStore.setState({
      origin: { label: "Dallas, TX", lat: 32.7, lng: -96.8 },
      destination: { label: "Chicago, IL", lat: 41.8, lng: -87.6 },
      departure: new Date(Date.now() + 3_600_000).toISOString(),
      loadLb: 20000,
      interval: "auto",
    });

    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("swap button swaps origin and destination", async () => {
    const user = userEvent.setup();
    usePlanStore.setState({
      origin: { label: "Dallas, TX", lat: 32.7, lng: -96.8 },
      destination: { label: "Chicago, IL", lat: 41.8, lng: -87.6 },
      departure: new Date(Date.now() + 3_600_000).toISOString(),
      loadLb: 0,
      interval: "auto",
    });
    wrap(
      <PlannerForm
        analyze={mockAnalyze()}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /swap origin and destination/i }),
    );
    expect(usePlanStore.getState().origin?.label).toBe("Chicago, IL");
    expect(usePlanStore.getState().destination?.label).toBe("Dallas, TX");
  });
});
