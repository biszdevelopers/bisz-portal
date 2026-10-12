export type BackendErrorDetails = {
  error: string;
  error_description: string;
  status: string | number;
  code: string | number;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function displayValue(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number"
    ? value
    : undefined;
}

export function normalizeBackendError(
  value: unknown,
  fallbackDescription = "The request could not be completed.",
): BackendErrorDetails {
  const source = asRecord(value);
  const data =
    asRecord(source?.data) ?? asRecord(asRecord(source?.cause)?.data) ?? source;
  const status =
    displayValue(data?.status) ??
    displayValue(source?.statusCode) ??
    displayValue(source?.status) ??
    "Unavailable";

  return {
    error: String(
      displayValue(data?.error) ??
        displayValue(source?.name) ??
        "request_failed",
    ),
    error_description: String(
      displayValue(data?.error_description) ??
        displayValue(data?.message) ??
        displayValue(source?.statusMessage) ??
        displayValue(source?.message) ??
        fallbackDescription,
    ),
    status,
    code: displayValue(data?.code) ?? displayValue(source?.code) ?? status,
  };
}

export function backendErrorMessage(
  value: unknown,
  fallbackDescription?: string,
) {
  const details = normalizeBackendError(value, fallbackDescription);
  return `${details.error}: ${details.error_description} (status: ${details.status}, code: ${details.code})`;
}
