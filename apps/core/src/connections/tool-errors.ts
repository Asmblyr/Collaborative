const messages: Readonly<Record<string, string>> = {
  connection_disabled: "Google Workspace is disabled in this installation.",
  connection_reconnect_required:
    "The personal Google connection must be reconnected before using its tools.",
  connection_provider_unavailable:
    "The Google request failed or timed out. This is not evidence about file access or content.",
  connection_google_access_denied:
    "Google denied this request. Check file access, granted scopes and Workspace policy; do not infer file content.",
  connection_google_not_found:
    "Google did not return this file. Check its ID and access for the connected account; do not infer file content.",
  connection_google_rate_limited:
    "Google rate-limited this request. Do not repeat it immediately.",
  connection_google_input_invalid:
    "Google rejected the request arguments. Check the tool's documented parameters.",
  connection_google_request_failed:
    "Google returned an API error. This is not evidence about file access or content.",
  connection_google_response_invalid:
    "Google returned an unexpected response. Do not infer file content.",
  connection_result_too_large:
    "The Google response exceeds the tool limit. Request a smaller range or text fragment.",
  connection_input_invalid:
    "Invalid Google tool input. Pass a file ID, not its URL, and use documented parameters.",
  connection_range_required:
    "Specify an explicit A1 cell rectangle, for example 'Sheet1'!A1:C5.",
  connection_range_too_large:
    "The A1 rectangle is invalid or exceeds 500 cells. Request a smaller rectangle.",
  connection_use_sheet_or_text_file:
    "This tool reads text files and Google Docs. Use describe-sheet and read-cells for spreadsheets.",
  connection_proposal_limit:
    "Too many Google write proposals are pending. Review existing proposals first.",
  connection_target_changed:
    "The Google target changed. Prepare a new proposal from its current data.",
};

/** Only fixed messages cross the model boundary; provider bodies and credentials do not. */
export function connectionToolError(
  value: unknown,
): { code: string; error: string } | null {
  if (!value || typeof value !== "object" || !("code" in value)) {
    return null;
  }
  const code = value.code;
  if (typeof code !== "string" || !Object.hasOwn(messages, code)) {
    return null;
  }
  return { code, error: messages[code]! };
}
