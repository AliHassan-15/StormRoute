import { GET_RETRY_BASE_MS, GET_RETRY_MAX } from "@/lib/constants";
import { env } from "@/lib/env";

import { ApiError, mapErrorBody } from "./errors";

const DEFAULT_TIMEOUT_MS = 15_000;
export const ANALYZE_TIMEOUT_MS = 45_000;

export interface ApiFetchOptions extends Omit<RequestInit, "signal"> {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Override automatic GET retry (default: retry idempotent GETs). */
  retry?: boolean;
}

function combineSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  if (!a) return b;
  if (!b) return a;
  if (typeof AbortSignal !== "undefined" && "any" in AbortSignal) {
    return AbortSignal.any([a, b]);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (a.aborted || b.aborted) {
    controller.abort();
    return controller.signal;
  }
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isRetryableGetError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.code === "ABORT" || error.code === "VALIDATION_ERROR") return false;
  return (
    error.code === "UPSTREAM_TIMEOUT" ||
    error.code === "NETWORK_ERROR" ||
    error.code === "INTERNAL" ||
    error.status === 502 ||
    error.status === 503 ||
    error.status === 504
  );
}

async function apiFetchOnce<T>(
  path: string,
  options: ApiFetchOptions,
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: outer, retry: _r, ...init } =
    options;
  const timeoutController = new AbortController();
  const timer = window.setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = combineSignals(outer, timeoutController.signal);

  const url = path.startsWith("http")
    ? path
    : `${env.VITE_API_BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const response = await fetch(url, {
      ...init,
      signal,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

    let body: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      const retryAfter = response.headers.get("Retry-After");
      throw mapErrorBody(response.status, body, retryAfter);
    }

    return body as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      if (outer?.aborted) {
        throw new ApiError("ABORT", "Request was cancelled.");
      }
      throw new ApiError("UPSTREAM_TIMEOUT", "Request timed out.");
    }
    if (error instanceof TypeError) {
      throw new ApiError("NETWORK_ERROR", "Network request failed.", {
        cause: error,
      });
    }
    throw new ApiError("INTERNAL", "Unexpected request failure.", {
      cause: error,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Fetch wrapper with AbortController timeout and typed D18 errors.
 * Idempotent GETs retry with exponential backoff. Units: timeoutMs is ms.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const shouldRetry =
    options.retry ?? (method === "GET" || method === "HEAD");

  let attempt = 0;
  for (;;) {
    try {
      return await apiFetchOnce<T>(path, options);
    } catch (error) {
      attempt += 1;
      if (
        !shouldRetry ||
        attempt > GET_RETRY_MAX ||
        !isRetryableGetError(error) ||
        options.signal?.aborted
      ) {
        throw error;
      }
      const delayMs = GET_RETRY_BASE_MS * 2 ** (attempt - 1);
      await sleep(delayMs, options.signal);
    }
  }
}
