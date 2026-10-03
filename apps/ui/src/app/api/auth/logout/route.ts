import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, coreAddress } from "@/lib/session";
import { hasForeignOrigin } from "@/lib/request-origin";

export async function POST(request: Request) {
  if (hasForeignOrigin(request)) {
    return Response.json({ message: "Forbidden origin" }, { status: 403 });
  }
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (refreshToken || token) {
    try {
      await fetch(coreAddress("/auth/logout"), { method: "POST",
        headers: refreshToken ? { "content-type": "application/json" }
          : { authorization: `Bearer ${token}` },
        body: refreshToken ? JSON.stringify({ refreshToken }) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(5000) });
    } catch { /* Local cookies are still cleared. */ }
  }
  const response = new NextResponse(null, { status: 204 });
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}
