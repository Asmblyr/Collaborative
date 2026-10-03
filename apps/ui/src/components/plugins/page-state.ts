export interface PluginPageState {
  dirty: boolean;
  busy: boolean;
}
const states = new Map<symbol, PluginPageState>();

export function reportPluginPageState(id: symbol, state: PluginPageState) {
  if (state.dirty || state.busy) states.set(id, state);
  else states.delete(id);
}
export function clearPluginPageState(id: symbol) {
  states.delete(id);
}
export function pluginPageBlocksNavigation(): boolean {
  return [...states.values()].some((state) => state.dirty || state.busy);
}
