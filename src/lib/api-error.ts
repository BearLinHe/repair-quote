export type ApiErrorPayload = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  const error: ApiErrorPayload["error"] = { code, message };
  if (details !== undefined) error.details = details;
  return Response.json({ error }, { status });
}

export function apiErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return fallback;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}
