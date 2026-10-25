import { describe, expect, test } from "bun:test";
import {
  backendErrorMessage,
  normalizeBackendError,
} from "../composables/useBackendError";

describe("backend error presentation", () => {
  test("preserves the complete API error envelope", () => {
    const error = normalizeBackendError({
      data: {
        error: "insufficient_permission",
        error_description: "The requested operation is not allowed",
        status: 403,
        code: "PROJECT_UPDATE_DENIED",
      },
    });

    expect(error).toEqual({
      error: "insufficient_permission",
      error_description: "The requested operation is not allowed",
      status: 403,
      code: "PROJECT_UPDATE_DENIED",
    });
    expect(backendErrorMessage({ data: error })).toContain(
      "status: 403, code: PROJECT_UPDATE_DENIED",
    );
  });

  test("fills every display field for non-envelope failures", () => {
    expect(normalizeBackendError(new Error("Network unavailable"))).toEqual({
      error: "Error",
      error_description: "Network unavailable",
      status: "Unavailable",
      code: "Unavailable",
    });
  });
});
