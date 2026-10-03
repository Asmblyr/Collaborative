import { submitOAuthInteraction } from "@/lib/oauth-proxy";

export async function POST(request: Request, context: { params: Promise<{ uid: string }> }) {
  return submitOAuthInteraction(request, (await context.params).uid);
}
