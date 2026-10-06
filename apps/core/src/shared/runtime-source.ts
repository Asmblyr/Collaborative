export type RuntimeSource<T> = T | null | (() => Promise<T | null>);

export async function resolveRuntime<T>(
  source: RuntimeSource<T>,
): Promise<T | null> {
  return typeof source === "function"
    ? (source as () => Promise<T | null>)()
    : source;
}
