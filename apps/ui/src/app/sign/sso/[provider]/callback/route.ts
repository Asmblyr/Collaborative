import { cookies } from "next/headers";
import type { TokenPair } from "@/lib/session";
import { safeNext } from "@/lib/session";
import { setSessionCookies } from "@/lib/session-cookies";
import { ssoProviderKey } from "@/lib/sso";
import {
  ssoCookie,
  ssoIntentCookie,
  ssoRequest,
  ssoRedirect,
  ssoFailurePath,
} from "@/lib/sso-server";

export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!ssoProviderKey(provider)) return new Response(null, { status: 404 });
  const jar = await cookies();
  const link = jar.get(ssoIntentCookie(provider))?.value === "link";
  const browserToken = jar.get(ssoCookie(provider))?.value;
  if (!browserToken)
    return ssoRedirect(request, ssoFailurePath(link, "SSO_INVALID_FLOW"), provider);
  let renewed: TokenPair | undefined;
  try {
    const upstream = await ssoRequest(
      `/auth/sso/${provider}/callback`,
      {
        browserToken,
        query: new URL(request.url).searchParams.toString(),
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
    const result = (await upstream.json()) as
      | { intent: "link"; returnTo: string }
      | { intent: "login"; returnTo: string; tokens: TokenPair };
    const destination =
      result.intent === "link"
        ? "/settings?tab=security&sso=SSO_LINKED"
        : safeNext(result.returnTo);
    const response = ssoRedirect(request, destination, provider, renewed);
    if (result.intent === "login") setSessionCookies(response, request, result.tokens);
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
