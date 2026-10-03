const coreUrl = process.env.CORE_URL ?? "http://127.0.0.1:3001";

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ message: "Ожидается JSON" }, { status: 415 });
  }
  try {
    const response = await fetch(new URL("/auth/setup", coreUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json({ message: "Core API недоступен" }, { status: 503 });
  }
}
