import { proxyItemMutation } from "../proxy";
import { proxyCore } from "@/lib/core-proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ collection: string }> },
) {
  const { collection } = await params;
  const query = new URL(request.url).searchParams;
  const allowed = new URLSearchParams();
  for (const key of ["fields", "q", "limit", "page", "sort", "direction", "filter"]) {
    const value = query.get(key);
    if (value !== null) allowed.set(key, value);
  }
  return proxyCore(request, `/items/${encodeURIComponent(collection)}?${allowed}`, "GET");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ collection: string }> },
) {
  const { collection } = await params;
  return proxyItemMutation(request, collection, "POST");
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ collection: string }> },
) {
  const { collection } = await params;
  return proxyItemMutation(request, collection, "PATCH");
}
