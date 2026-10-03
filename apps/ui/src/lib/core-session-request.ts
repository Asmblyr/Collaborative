import { coreAddress, type TokenPair } from "./session";
import { renewSession, SessionExpiredError } from "./renew-session";

interface SessionTokens {
  accessToken?: string;
  refreshToken?: string;
}
interface CoreRequest {
  method: string;
  body?: BodyInit;
  headers?: Record<string, string>;
  timeoutMs: number;
  signal?: AbortSignal;
  redirect?: RequestRedirect;
}

export async function requestCoreWithSession(
  path: string,
  request: CoreRequest,
  session: SessionTokens,
  onRenew: (pair: TokenPair) => void,
): Promise<Response> {
  const send = (token: string) =>
    fetch(coreAddress(path), {
      method: request.method,
      redirect: request.redirect,
      headers: {
        authorization: `Bearer ${token}`,
        ...(request.body !== undefined
          ? { "content-type": "application/json" }
          : {}),
        ...request.headers,
      },
      body: request.body,
      cache: "no-store",
      signal: request.signal
        ? AbortSignal.any([
            request.signal,
            AbortSignal.timeout(request.timeoutMs),
          ])
        : AbortSignal.timeout(request.timeoutMs),
    });

  if (session.accessToken) {
    const response = await send(session.accessToken);
    if (response.status !== 401 || !session.refreshToken) return response;
    await response.body?.cancel();
  }
  if (!session.refreshToken) throw new SessionExpiredError();
  const pair = await renewSession(session.refreshToken);
  // Preserve rotated cookies even if the following API request fails.
  onRenew(pair);
  // Retry only an authentication rejection, never a timeout or a failed mutation.
  return send(pair.accessToken);
}
