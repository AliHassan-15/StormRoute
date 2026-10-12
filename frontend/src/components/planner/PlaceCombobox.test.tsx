import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import * as hooks from "@/api/hooks";
import type { GeocodeResult } from "@/api/schemas";
import { PlaceCombobox } from "@/components/planner/PlaceCombobox";

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("PlaceCombobox", () => {
  it("supports keyboard selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.spyOn(hooks, "fetchGeocode").mockResolvedValue([
      { id: "1", label: "Dallas, Texas", lat: 32.7, lng: -96.8 },
      { id: "2", label: "Dallas, Oregon", lat: 45.0, lng: -123.3 },
    ]);

    wrap(
      <PlaceCombobox
        id="origin"
        label="Origin"
        value={null}
        onChange={onChange}
      />,
    );

    const input: HTMLInputElement = screen.getByRole("combobox");
    await user.type(input, "Dal");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /Dallas, Texas/i }),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(input).toHaveAttribute("aria-activedescendant", "origin-opt-0"),
    );

    // ArrowDown moves highlight (ARIA activedescendant).
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() =>
      expect(input).toHaveAttribute("aria-activedescendant", "origin-opt-1"),
    );

    // Enter selects the active option.
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const last = onChange.mock.calls.at(-1)?.[0] as
      | { label?: string }
      | undefined;
    expect(last?.label).toBe("Dallas, Oregon");

    // Esc closes the list after reopening via clear + retype.
    onChange.mockClear();
    await user.clear(input);
    await user.type(input, "Dal");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /Dallas, Texas/i }),
      ).toBeInTheDocument(),
    );
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );
  });

  it("ignores stale geocode responses", async () => {
    const user = userEvent.setup();
    let resolveSlow: (v: GeocodeResult[]) => void = () => undefined;
    const slow = new Promise<GeocodeResult[]>((resolve) => {
      resolveSlow = resolve;
    });

    vi.spyOn(hooks, "fetchGeocode").mockImplementation((query) => {
      if (query.startsWith("Den")) return slow;
      return Promise.resolve([
        { id: "c", label: "Chicago, IL", lat: 41.8, lng: -87.6 },
      ]);
    });

    wrap(
      <PlaceCombobox
        id="origin"
        label="Origin"
        value={null}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByRole("combobox");
    await user.type(input, "Den");
    await user.clear(input);
    await user.type(input, "Chi");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: /Chicago, IL/i }),
      ).toBeInTheDocument(),
    );

    resolveSlow([{ id: "d", label: "Denver, CO", lat: 39.7, lng: -105.0 }]);

    await waitFor(() => {
      expect(
        screen.queryByRole("option", { name: /Denver, CO/i }),
      ).not.toBeInTheDocument();
    });
  });
});
