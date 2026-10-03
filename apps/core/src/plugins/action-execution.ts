/** Stop waiting even when a trusted plugin ignores cancellation. Its code must still cooperate. */
export async function runActionWithSignal<T>(
  signal: AbortSignal,
  run: () => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve().then(run), cancelled]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
