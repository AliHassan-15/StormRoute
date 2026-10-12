export const SOURCE = {
  routes: "routes",
  riskSegments: "risk-segments",
  checkpoints: "checkpoints",
  heatPoints: "heat-points",
} as const;

export const LAYER = {
  routesCasing: "routes-casing",
  routesBase: "routes-base",
  riskSolid: "risk-segments-solid",
  riskNoTravel: "risk-segments-no-travel",
  riskUnknown: "risk-segments-unknown",
  riskHover: "risk-segments-hover",
  checkpoints: "checkpoints-circle",
  checkpointLabels: "checkpoints-label",
  heatmap: "heatmap",
  heatHit: "heat-hit",
} as const;

export const CUSTOM_LAYER_IDS = Object.values(LAYER);
export const CUSTOM_SOURCE_IDS = Object.values(SOURCE);
