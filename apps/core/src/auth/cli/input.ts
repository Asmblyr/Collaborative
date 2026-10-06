import { objectInput } from "../../shared/input.js";
import { AuthInputError } from "../validation.js";
export function loopbackUri(value: unknown): string {
  if (typeof value !== "string") {
    throw new AuthInputError("Invalid CLI callback");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AuthInputError("Invalid CLI callback");
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.pathname !== "/callback" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.href !== value
  ) {
    throw new AuthInputError("CLI callback must be an exact loopback URI");
  }
  return url.href;
}
function randomValue(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new AuthInputError("Invalid CLI authorization value");
  }
  return value;
}
export function parseCliAuthorization(body: unknown): {
  redirectUri: string;
  challenge: string;
  state: string;
} {
  const input = objectInput(body, ["redirectUri", "challenge", "state"]);
  return {
    redirectUri: loopbackUri(input.redirectUri),
    challenge: randomValue(input.challenge),
    state: randomValue(input.state),
  };
}
export function parseCliExchange(body: unknown): {
  redirectUri: string;
  code: string;
  verifier: string;
} {
  const input = objectInput(body, ["redirectUri", "code", "verifier"]);
  if (
    typeof input.verifier !== "string" ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(input.verifier)
  ) {
    throw new AuthInputError("Invalid PKCE verifier");
  }
  return {
    redirectUri: loopbackUri(input.redirectUri),
    code: randomValue(input.code),
    verifier: input.verifier,
  };
}
