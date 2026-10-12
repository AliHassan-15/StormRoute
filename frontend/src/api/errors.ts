/** Typed API errors matching backend D18 codes. */

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "GEOCODE_FAILED",
  "NO_ROUTE",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_RATE_LIMIT",
  "FORECAST_UNAVAILABLE",
  "INTERNAL",
  "NETWORK_ERROR",
  "ABORT",
  "UNEXPECTED_RESPONSE",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly status?: number;
  /** Seconds to wait before retry when rate-limited (from Retry-After). */
  readonly retryAfterS?: number;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      details?: unknown;
      status?: number;
      cause?: unknown;
      retryAfterS?: number;
    },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "ApiError";
    this.code = code;
    this.details = options?.details;
    this.status = options?.status;
    this.retryAfterS = options?.retryAfterS;
  }
}

const FRIENDLY: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Some inputs need attention. Check the form and try again.",
  GEOCODE_FAILED: "We could not look up that place. Try a clearer city or address.",
  NO_ROUTE:
    "No driving route was found between those points. Try places farther apart, or pick suggestions from the list instead of free text.",
  UPSTREAM_TIMEOUT: "A map or weather service timed out. Please retry in a moment.",
  UPSTREAM_RATE_LIMIT: "Too many requests right now. Wait a few seconds and retry.",
  FORECAST_UNAVAILABLE: "Weather forecast is unavailable for this trip. Please retry later.",
  INTERNAL: "Something went wrong on our side. Please retry.",
  NETWORK_ERROR: "Network problem. Check your connection and retry.",
  ABORT: "Request was cancelled.",
  UNEXPECTED_RESPONSE: "Unexpected server response. Please retry.",
};

export function friendlyErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return FRIENDLY[error.code] ?? error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return FRIENDLY.INTERNAL;
}

function parseRetryAfterSeconds(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const asInt = Number.parseInt(header, 10);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt;
  const when = Date.parse(header);
  if (!Number.isFinite(when)) return undefined;
  return Math.max(0, Math.ceil((when - Date.now()) / 1000));
}

export function mapErrorBody(
  status: number,
  body: unknown,
  retryAfterHeader?: string | null,
): ApiError {
  const retryAfterS = parseRetryAfterSeconds(retryAfterHeader ?? null);
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object"
  ) {
    const err = body.error as { code?: string; message?: string; details?: unknown };
    const code = (ERROR_CODES as readonly string[]).includes(err.code ?? "")
      ? (err.code as ErrorCode)
      : "INTERNAL";
    return new ApiError(code, err.message ?? FRIENDLY[code], {
      details: err.details,
      status,
      retryAfterS: status === 429 ? retryAfterS : undefined,
    });
  }
  if (status === 429) {
    return new ApiError("UPSTREAM_RATE_LIMIT", FRIENDLY.UPSTREAM_RATE_LIMIT, {
      status,
      retryAfterS,
    });
  }
  return new ApiError("INTERNAL", FRIENDLY.INTERNAL, { status, details: body });
}
