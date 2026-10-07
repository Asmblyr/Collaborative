/** Process health only; Core/database readiness belongs to the Core deployment. */
export function GET() {
  return Response.json(
    { status: "ok", service: "ui" },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
