import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ApiErrorBody } from "@asmblyr/contracts";

export function describeRequestError(
  error: unknown,
  request: Pick<FastifyRequest, "id" | "log">,
): { status: number; body: ApiErrorBody } {
  const failure = error instanceof Error ? error : new Error("Unknown failure");
  const proposedStatus = "statusCode" in failure ? failure.statusCode : 500;
  const status =
    typeof proposedStatus === "number" &&
    Number.isInteger(proposedStatus) &&
    proposedStatus >= 400 &&
    proposedStatus <= 599
      ? proposedStatus
      : 500;
  const isClientError = status >= 400 && status < 500;

  if (!isClientError) {
    request.log.error({ err: error, requestId: request.id }, "Request failed");
  }

  const clientCode =
    "code" in failure && typeof failure.code === "string" ? failure.code : "INVALID_REQUEST";
  const code = isClientError ? clientCode : "INTERNAL_ERROR";
  const message = isClientError ? failure.message : "An internal error occurred";
  return { status, body: { code, message, requestId: request.id } };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const { status, body } = describeRequestError(error, request);
    return reply.code(status).send(body);
  });
}
