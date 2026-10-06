import { cookies } from "next/headers";
import type { TokenPair } from "@/lib/session";
import {
  GOOGLE_CONNECTION_COOKIE,
  googleRequest,
  googleCallbackResponse,
} from "@/lib/google-connection-server";
export async function GET(request: Request) {
  const browserToken = (await cookies()).get(GOOGLE_CONNECTION_COOKIE)?.value;
  if (!browserToken) {
    return googleCallbackResponse(request, "failed");
  }
  let renewed: TokenPair | undefined;
  try {
    const upstream = await googleRequest(
      request,
      "/connections/google/callback",
      { browserToken, query: new URL(request.url).searchParams.toString() },
      (pair) => {
        renewed = pair;
      },
    );
    return googleCallbackResponse(
      request,
      upstream.ok ? "connected" : "failed",
      renewed,
    );
  } catch {
    return googleCallbackResponse(request, "failed", renewed);
  }
}
