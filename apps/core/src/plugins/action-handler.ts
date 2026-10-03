import { H3Event } from "h3";
import type {
  ActionContext,
  EndpointDefinition,
  PluginAction,
} from "@asmblyr/kit";

/** HTTP and MCP invoke the same H3 handler with validated JSON and the same capabilities. */
export async function runActionHandler(
  endpoint: EndpointDefinition,
  action: PluginAction,
  value: unknown,
  context: ActionContext,
): Promise<{ input: object; output: object }> {
  context.signal.throwIfAborted();
  const input = action.parseInput(value);
  const request = new Request(`http://plugin.internal${endpoint.path}`, {
    method: endpoint.method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: context.signal,
  });
  const event = new H3Event(request, {
    asmblyrAction: Object.freeze(context),
  });
  const output = await endpoint.handler(event);
  context.signal.throwIfAborted();
  // Calculations return data, not redirects, cookies or streaming HTTP responses.
  const status = event.res.status ?? 200;
  if (
    output instanceof Response ||
    status !== 200 ||
    [...event.res.headers].length
  ) {
    throw new Error(
      "Action handlers must return a JSON object without HTTP response mutations",
    );
  }
  return { input, output: action.parseOutput(output) };
}
