import { z } from "zod";

/** Ensure deploy envs like `foo.onrender.com` become valid absolute URLs. */
function normalizeBaseUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "http://localhost:8000";
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, "");
  return `https://${value.replace(/\/+$/, "")}`;
}

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().url(),
  VITE_MAPBOX_TOKEN: z.string().default(""),
  VITE_E2E: z.string().optional(),
});

export const env = envSchema.parse({
  VITE_API_BASE_URL: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL),
  VITE_MAPBOX_TOKEN: import.meta.env.VITE_MAPBOX_TOKEN ?? "",
  VITE_E2E: import.meta.env.VITE_E2E,
});
