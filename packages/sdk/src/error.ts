import type { ApiErrorBody } from "@asmblyr/contracts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function responseError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  const details: Partial<ApiErrorBody> = {};
  if (body && typeof body === "object") {
    if ("message" in body && typeof body.message === "string") details.message = body.message;
    if ("code" in body && typeof body.code === "string") details.code = body.code;
    if ("requestId" in body && typeof body.requestId === "string")
      details.requestId = body.requestId;
  }
  return new ApiError(
    details.message ?? `API request failed (${response.status})`,
    response.status,
    details.code,
    details.requestId,
  );
}
