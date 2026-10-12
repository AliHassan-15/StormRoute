/**
 * Keyboard handling for the heatmap hour slider.
 * Left/Right ±1 h, Shift+Left/Right ±6 h, Home/End, Space play toggle.
 */

export const FRAME_MAX = 48;

export interface SliderKeyResult {
  hour?: number;
  togglePlay?: boolean;
}

export function handleHeatmapSliderKey(
  key: string,
  shiftKey: boolean,
  hour: number,
): SliderKeyResult {
  const clamp = (h: number) => Math.min(FRAME_MAX, Math.max(0, h));
  switch (key) {
    case "ArrowLeft":
      return { hour: clamp(hour - (shiftKey ? 6 : 1)) };
    case "ArrowRight":
      return { hour: clamp(hour + (shiftKey ? 6 : 1)) };
    case "Home":
      return { hour: 0 };
    case "End":
      return { hour: FRAME_MAX };
    case " ":
    case "Spacebar":
      return { togglePlay: true };
    default:
      return {};
  }
}
