import { describe, expect, it } from "vitest";

import { handleHeatmapSliderKey } from "./sliderKeys";

describe("handleHeatmapSliderKey", () => {
  it("moves by 1h and 6h with shift", () => {
    expect(handleHeatmapSliderKey("ArrowRight", false, 10)).toEqual({
      hour: 11,
    });
    expect(handleHeatmapSliderKey("ArrowLeft", true, 10)).toEqual({
      hour: 4,
    });
  });

  it("clamps Home/End and toggles play on Space", () => {
    expect(handleHeatmapSliderKey("Home", false, 12)).toEqual({ hour: 0 });
    expect(handleHeatmapSliderKey("End", false, 12)).toEqual({ hour: 48 });
    expect(handleHeatmapSliderKey(" ", false, 12)).toEqual({
      togglePlay: true,
    });
  });
});
