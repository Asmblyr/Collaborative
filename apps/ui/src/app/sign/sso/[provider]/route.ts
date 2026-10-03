import { randomBytes } from "node:crypto";
import { hasForeignOrigin } from "@/lib/request-origin";
import { cookieOptions, safeNext, type TokenPair } from "@/lib/session";
import { ssoProviderKey } from "@/lib/sso";
import {
  ssoCookie,
  ssoIntentCookie,
  ssoRequest,
  ssoRedirect,
  ssoFailurePath,
} from "@/lib/sso-server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!ssoProviderKey(provider)) return new Response(null, { status: 404 });
  if (!request.headers.has("origin") || hasForeignOrigin(request)) {
    return new Response("Forbidden origin", { status: 403 });
  }
  let link = false;
  let renewed: TokenPair | undefined;
  try {
    const form = await request.formData();
    link = form.get("intent") === "link";
    const browserToken = randomBytes(32).toString("base64url");
    const next = form.get("next");
    const upstream = await ssoRequest(
      `/auth/sso/${provider}/start`,
      {
        browserToken,
        intent: link ? "link" : "login",
        returnTo: safeNext(typeof next === "string" ? next : null),
        uiOrigin: request.headers.get("origin"),
      },
      link,
      request,
      (pair) => {
        renewed = pair;
      },
    );
    if (!upstream.ok) {
      const error = (await upstream.json()) as { code?: string };
      return ssoRedirect(
        request,
        ssoFailurePath(link, error.code ?? "SSO_AUTH_FAILED"),
        provider,
        renewed,
      );
    }
    const { authorizationUrl } = (await upstream.json()) as {
      authorizationUrl: string;
    };
    const response = ssoRedirect(request, authorizationUrl, provider, renewed);
    const options = {
      ...cookieOptions(request, 600),
      path: `/sign/sso/${provider}`,
    };
    response.cookies.set(ssoCookie(provider), browserToken, options);
    response.cookies.set(
      ssoIntentCookie(provider),
      link ? "link" : "login",
      options,
    );
    return response;
  } catch {
    return ssoRedirect(
      request,
      ssoFailurePath(link, "SSO_PROVIDER_UNAVAILABLE"),
      provider,
      renewed,
    );
  }
}
