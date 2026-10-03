import { NextResponse } from "next/server";
import { proxyCore } from "@/lib/core-proxy";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  const upstream = await proxyCore(request, "/users/me/password", "POST");
  if (upstream.status !== 204) return upstream;
  const response = new NextResponse(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}
