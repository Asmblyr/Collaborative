/** Created by Core after successful validation/execution, never authored by the model. */
export interface PluginActionResult {
  namespace: string;
  actionId: string;
  input: object;
  output: object;
}

export interface PluginPreparedAction extends PluginActionResult {
  draftId: string;
  pageId: string;
  title: string;
  expiresAt: string;
  href: string;
}

export interface AssistantPluginResult {
  draftId: string;
  namespace: string;
  title: string;
  expiresAt: string;
}
