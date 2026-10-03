import { authEntryProxy } from "@/lib/auth-entry-proxy";
export function POST(request: Request) {
  return authEntryProxy(request, "/auth/invitations/claim", "link");
}
