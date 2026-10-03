export const privateLogger = {
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
      "password",
      "token",
      "refreshToken",
    ],
    censor: "[redacted]",
  },
  serializers: {
    req(request: { id: string; method: string; url: string }) {
      return {
        id: request.id,
        method: request.method,
        path: request.url.split("?")[0],
      };
    },
    err(error: { name?: string; code?: unknown }) {
      return {
        type: error?.name ?? "Error",
        message: "Internal failure",
        stack: "",
        code: typeof error?.code === "string" ? error.code : undefined,
      };
    },
  },
};
