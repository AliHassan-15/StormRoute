import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AnalyzeRoute } from "@/api/schemas";
import { RouteCard } from "@/components/results/RouteCard";
import golden from "@/test/fixtures/analyze-golden.json";

const route = golden.routes[0] as AnalyzeRoute;

describe("RouteCard", () => {
  it("selects by keyboard", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <RouteCard
        route={route}
        selected={false}
        index={0}
        onSelect={onSelect}
        onHover={vi.fn()}
      />,
    );
    const radio = screen.getByRole("radio");
    await user.click(radio);
    expect(onSelect).toHaveBeenCalledTimes(1);
    onSelect.mockClear();
    radio.focus();
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
