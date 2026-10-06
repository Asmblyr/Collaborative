import { createServer } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { apiUrl } from "./config.mjs";
import { openBrowser as launchBrowser } from "./browser.mjs";
async function json(fetch, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Object.assign(
      new Error(`CLI authorization request failed (HTTP ${response.status})`),
      { status: response.status },
    );
  }
  return response.json();
}
export async function discoverApi(url, fetch = globalThis.fetch) {
  let root = apiUrl(url);
  let result;
  try {
    result = await json(fetch, `${root}/auth/cli/config`);
  } catch (error) {
    if (error.status !== 404 || root.endsWith("/api")) {
      throw error;
    }
    root += "/api";
    result = await json(fetch, `${root}/auth/cli/config`);
  }
  const authorizationUrl = apiUrl(result?.data?.authorizationUrl);
  return { root, authorizationUrl };
}
export async function browserLogin(
  root,
  {
    fetch = globalThis.fetch,
    out = console.log,
    openBrowser = launchBrowser,
    noBrowser = false,
    timeoutMs = 300000,
  } = {},
) {
  const api = await discoverApi(root, fetch);
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  let resolveCode;
  let rejectCode;
  const pending = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  pending.catch(() => {});
  let expectedHost;
  let callbackResponse;
  const server = createServer((request, response) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("referrer-policy", "no-referrer");
    response.setHeader("content-type", "text/plain; charset=utf-8");
    let callback;
    try {
      callback = new URL(request.url, "http://127.0.0.1");
    } catch {
      response.writeHead(400).end("Invalid authorization callback.");
      return;
    }
    const receivedState = callback.searchParams.get("state") ?? "";
    const stateBytes = Buffer.from(state);
    const receivedBytes = Buffer.from(receivedState);
    const validState =
      receivedBytes.length === stateBytes.length &&
      timingSafeEqual(receivedBytes, stateBytes);
    if (
      request.method !== "GET" ||
      request.headers.host !== expectedHost ||
      callback.pathname !== "/callback" ||
      !validState
    ) {
      response.writeHead(400).end("Invalid authorization callback.");
      return;
    }
    if (callback.searchParams.get("error") === "access_denied") {
      response.end("Connection cancelled. You can close this tab.");
      rejectCode(new Error("CLI connection cancelled"));
      return;
    }
    const code = callback.searchParams.get("code");
    if (!code || !/^[A-Za-z0-9_-]{43}$/.test(code)) {
      response.writeHead(400).end("Invalid authorization code.");
      return;
    }
    if (callbackResponse) {
      response.writeHead(400).end("Authorization callback already received.");
      return;
    }
    callbackResponse = response;
    resolveCode(code);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  expectedHost = `127.0.0.1:${address.port}`;
  const redirectUri = `http://${expectedHost}/callback`;
  const authorization = new URL(api.authorizationUrl);
  authorization.search = new URLSearchParams({
    redirectUri,
    challenge,
    state,
  }).toString();
  const timer = setTimeout(
    () =>
      rejectCode(
        new Error("CLI authorization timed out. Run the command again."),
      ),
    timeoutMs,
  );
  try {
    out(`Approve schema access in your Asmblyr admin: ${authorization.href}`);
    if (!noBrowser) {
      try {
        await openBrowser(authorization.href);
      } catch {
        out("Open the URL above in your browser to continue.");
      }
    }
    const code = await pending;
    const result = await json(fetch, `${api.root}/auth/cli/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, verifier, redirectUri }),
    });
    if (
      result?.data?.scope !== "schema:read" ||
      !/^asm_sc_[A-Za-z0-9_-]{43}$/.test(result?.data?.accessToken ?? "")
    ) {
      throw new Error("Invalid CLI schema credential");
    }
    callbackResponse
      .writeHead(303, {
        location: new URL("/sdk/connected", api.authorizationUrl).href,
      })
      .end();
    return { url: api.root, token: result.data.accessToken };
  } catch (error) {
    callbackResponse
      ?.writeHead(400)
      .end("Connection failed. Return to the terminal for details.");
    throw error;
  } finally {
    clearTimeout(timer);
    await new Promise((resolve) => {
      // Let the browser receive the completion redirect, but bound shutdown if
      // an unrelated local connection does not finish.
      const forceClose = setTimeout(() => server.closeAllConnections(), 1000);
      server.close(() => {
        clearTimeout(forceClose);
        resolve();
      });
    });
  }
}
