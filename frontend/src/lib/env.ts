import { z } from "zod";

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().url().default("http://localhost:8000"),
  VITE_MAPBOX_TOKEN: z.string().default(""),
  VITE_E2E: z.string().optional(),
});

export const env = envSchema.parse({
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
  VITE_MAPBOX_TOKEN: import.meta.env.VITE_MAPBOX_TOKEN ?? "",
  VITE_E2E: import.meta.env.VITE_E2E,
});
