import { useActionContext } from "@asmblyr-collaborative/kit";
import type { H3Event } from "h3";
export function google(event: H3Event) {
  const connection = useActionContext(event).connections?.google;
  if (!connection) {
    throw new Error("Google Workspace connection unavailable");
  }
  return connection;
}
