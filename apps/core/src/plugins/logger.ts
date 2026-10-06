import type { EndpointLogger } from "@asmblyr-collaborative/kit";
import type { FastifyBaseLogger } from "fastify";

export function endpointLogger(log: FastifyBaseLogger): EndpointLogger {
  return {
    info: (message, details) => log.info({ details }, message),
    warn: (message, details) => log.warn({ details }, message),
    error: (message, details) => log.error({ details }, message),
  };
}
