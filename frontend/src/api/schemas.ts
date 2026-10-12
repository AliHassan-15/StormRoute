/**
 * Zod schemas mirroring docs/API.md — single source of truth for API types.
 */
import { z } from "zod";

export const placeSchema = z.object({
  label: z.string(),
  lat: z.number().finite(),
  lng: z.number().finite(),
});

export const geocodeResultSchema = z.object({
  id: z.string(),
  label: z.string(),
  lat: z.number().finite(),
  lng: z.number().finite(),
});

export const geocodeResponseSchema = z.array(geocodeResultSchema);

const bandSchema = z.object({
  level: z.string(),
  value: z.number().int(),
  lower: z.number().nullable(),
  upper: z.number().nullable(),
  lower_inclusive: z.boolean(),
  upper_inclusive: z.boolean(),
});

const loadRuleSchema = z.object({
  id: z.string(),
  wind_lower: z.number(),
  wind_upper: z.number().nullable(),
  wind_lower_inclusive: z.boolean(),
  wind_upper_inclusive: z.boolean(),
  load_gt_lb: z.number().nullable(),
  raises_to: z.string(),
  raises_to_value: z.number().int(),
  description: z.string(),
});

export const metaResponseSchema = z.object({
  levels: z.array(
    z.object({
      value: z.number().int(),
      name: z.string(),
      label: z.string(),
    }),
  ),
  thresholds: z.object({
    wind_mph: z.object({ bands: z.array(bandSchema) }),
    rain_in_hr: z.object({ bands: z.array(bandSchema) }),
    snow_in_hr: z.object({ bands: z.array(bandSchema) }),
  }),
  load_rules: z.array(loadRuleSchema),
  units: z.record(z.string(), z.string()),
  version: z.string(),
});

const milesByLevelSchema = z.object({
  LOW: z.number(),
  MODERATE: z.number(),
  HIGH: z.number(),
  SEVERE: z.number(),
  NO_TRAVEL: z.number(),
  UNKNOWN: z.number(),
});

const weatherSchema = z
  .object({
    wind_mph: z.number(),
    gust_mph: z.number().nullable(),
    rain_in_hr: z.number().nullable(),
    snow_in_hr: z.number().nullable(),
  })
  .nullable();

export const checkpointSchema = z.object({
  index: z.number().int(),
  mile: z.number(),
  lat: z.number(),
  lng: z.number(),
  eta_utc: z.string(),
  eta_local: z.string(),
  tz: z.string(),
  coverage_from_mi: z.number(),
  coverage_to_mi: z.number(),
  weather: weatherSchema,
  weather_status: z.enum(["ok", "missing", "out_of_range"]),
  level: z.number().int().min(1).max(5).nullable(),
  level_name: z.string(),
  condition_levels: z
    .object({
      wind: z.string(),
      rain: z.string(),
      snow: z.string(),
    })
    .nullable(),
  reasons: z.array(z.string()),
});

export const routeSchema = z.object({
  id: z.string(),
  label: z.string(),
  rank: z.number().int().min(1),
  is_recommended: z.boolean(),
  is_blocked: z.boolean(),
  distance_mi: z.number(),
  duration_s: z.number(),
  delay_vs_fastest_s: z.number(),
  arrival_utc: z.string().nullable(),
  arrival_local: z.string().nullable(),
  geometry: z.object({
    type: z.literal("LineString"),
    coordinates: z.array(z.tuple([z.number(), z.number()])),
  }),
  metrics: z.object({
    miles_by_level: milesByLevelSchema,
    severe_miles: z.number(),
    high_miles: z.number(),
    no_travel_miles: z.number(),
    avg_risk: z.number().nullable(),
    worst_level: z
      .enum(["LOW", "MODERATE", "HIGH", "SEVERE", "NO_TRAVEL"])
      .nullable(),
  }),
  checkpoints: z.array(checkpointSchema),
});

export const analyzeResponseSchema = z.object({
  request_id: z.string(),
  generated_at_utc: z.string(),
  input: z.object({
    origin: placeSchema,
    destination: placeSchema,
    departure_time_utc: z.string(),
    load_lb: z.number(),
    interval_requested: z.union([
      z.literal("auto"),
      z.literal(10),
      z.literal(25),
      z.literal(50),
    ]),
    interval_used_mi: z.number(),
  }),
  routes: z.array(routeSchema),
  recommendation: z.object({
    route_id: z.string().nullable(),
    explanation: z.string(),
    all_blocked: z.boolean(),
  }),
  notices: z.array(z.string()),
});

export const analyzeRequestSchema = z.object({
  origin: placeSchema,
  destination: placeSchema,
  departure_time: z.string(),
  load_lb: z.number().min(0).max(200_000),
  interval: z.union([
    z.literal("auto"),
    z.literal(10),
    z.literal(25),
    z.literal(50),
  ]),
});

export const heatmapPointSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
  wind: z.array(z.number().finite().nullable()),
  rain: z.array(z.number().finite().nullable()),
  snow: z.array(z.number().finite().nullable()),
  risk: z.array(z.number().int().nullable()),
});

export const heatmapResponseSchema = z.object({
  t0_utc: z.string(),
  frame_count: z.number().int(),
  points: z.array(heatmapPointSchema),
  notices: z.array(z.string()),
});

export const heatmapRequestSchema = z.object({
  origin: placeSchema,
  destination: placeSchema,
  departure_time: z.string(),
  load_lb: z.number().min(0).max(200_000),
});

export type Place = z.infer<typeof placeSchema>;
export type GeocodeResult = z.infer<typeof geocodeResultSchema>;
export type MetaResponse = z.infer<typeof metaResponseSchema>;
export type Checkpoint = z.infer<typeof checkpointSchema>;
export type AnalyzeRoute = z.infer<typeof routeSchema>;
export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export type HeatmapPoint = z.infer<typeof heatmapPointSchema>;
export type HeatmapResponse = z.infer<typeof heatmapResponseSchema>;
export type HeatmapRequest = z.infer<typeof heatmapRequestSchema>;
