import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RiskBadge } from "@/components/ui/risk-badge";

describe("RiskBadge", () => {
  it("pairs colour with a text label", () => {
    render(<RiskBadge level="SEVERE" />);
    expect(screen.getByText("Severe")).toBeInTheDocument();
    expect(screen.getByText("Severe").closest("[data-risk]")).toHaveAttribute(
      "data-risk",
      "SEVERE",
    );
  });
});
