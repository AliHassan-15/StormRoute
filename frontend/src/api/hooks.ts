import { useMutation, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useRef } from "react";
import type { z } from "zod";

import { ApiError } from "./errors";
import { ANALYZE_TIMEOUT_MS, apiFetch } from "./client";
import {
  analyzeResponseSchema,
  geocodeResponseSchema,
  heatmapResponseSchema,
  metaResponseSchema,
  type AnalyzeRequest,
  type AnalyzeResponse,
  type GeocodeResult,
  type HeatmapRequest,
  type HeatmapResponse,
  type MetaResponse,
} from "./schemas";

function parseWithSchema<S extends z.ZodType>(
  schema: S,
  data: unknown,
  label: string,
): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    if (import.meta.env.DEV) {
      console.error(`[StormRoute] Unexpected server response for ${label}`, {
        issues: result.error.issues,
        data,
      });
    }
    throw new ApiError(
      "UNEXPECTED_RESPONSE",
      "Unexpected server response",
      { details: result.error.issues },
    );
  }
  return result.data;
}

export function useMeta(): UseQueryResult<MetaResponse> {
  return useQuery({
    queryKey: ["meta"],
    queryFn: async ({ signal }) => {
      const raw = await apiFetch<unknown>("/api/meta", { signal });
      return parseWithSchema(metaResponseSchema, raw, "meta");
    },
    staleTime: Infinity,
  });
}

export async function fetchGeocode(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const raw = await apiFetch<unknown>(
    `/api/geocode?q=${encodeURIComponent(query)}`,
    { signal, timeoutMs: 10_000 },
  );
  return parseWithSchema(geocodeResponseSchema, raw, "geocode");
}

export function useGeocode() {
  return useMutation({
    mutationFn: async ({
      query,
      signal,
    }: {
      query: string;
      signal?: AbortSignal;
    }) => fetchGeocode(query, signal),
  });
}

export interface AnalyzeMutation {
  mutate: (
    body: AnalyzeRequest,
    options?: {
      onSuccess?: (data: AnalyzeResponse) => void;
      onError?: (error: ApiError) => void;
    },
  ) => void;
  isPending: boolean;
  reset: () => void;
  cancel: () => void;
}

export function useAnalyze(): AnalyzeMutation {
  const abortRef = useRef<AbortController | null>(null);

  const mutation = useMutation<AnalyzeResponse, ApiError, AnalyzeRequest>({
    mutationFn: async (body: AnalyzeRequest) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const raw = await apiFetch<unknown>("/api/analyze", {
          method: "POST",
          body: JSON.stringify(body),
          signal: controller.signal,
          timeoutMs: ANALYZE_TIMEOUT_MS,
        });
        return parseWithSchema(analyzeResponseSchema, raw, "analyze");
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
  });

  return {
    mutate: (body, options) => {
      mutation.mutate(body, {
        onSuccess: options?.onSuccess,
        onError: options?.onError,
      });
    },
    isPending: mutation.isPending,
    reset: () => mutation.reset(),
    cancel: () => {
      abortRef.current?.abort();
      abortRef.current = null;
      mutation.reset();
    },
  };
}

export async function fetchHeatmap(
  body: HeatmapRequest,
  signal?: AbortSignal,
): Promise<HeatmapResponse> {
  const raw = await apiFetch<unknown>("/api/heatmap", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
    timeoutMs: ANALYZE_TIMEOUT_MS,
  });
  return parseWithSchema(heatmapResponseSchema, raw, "heatmap");
}

export function useHeatmapMutation() {
  const abortRef = useRef<AbortController | null>(null);
  const mutation = useMutation<HeatmapResponse, ApiError, HeatmapRequest>({
    mutationFn: async (body) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        return await fetchHeatmap(body, controller.signal);
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
    reset: () => {
      abortRef.current?.abort();
      abortRef.current = null;
      mutation.reset();
    },
    cancel: () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
  };
}
