/** One investigation advance at a time inside this process. */

let pending: Promise<void> = Promise.resolve();

export function withAdvanceLock<T>(work: () => T | Promise<T>): Promise<T> {
  const run = pending.then(() => work());
  pending = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
