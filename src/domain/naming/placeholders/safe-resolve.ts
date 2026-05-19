/** Runs a placeholder resolver; never throws — returns fallback on error or empty result. */
export function resolvePlaceholder(
  fallback: string,
  fn: () => string | Promise<string>,
): string | Promise<string> {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then((value) => value || fallback).catch(() => fallback);
    }
    return result || fallback;
  } catch {
    return fallback;
  }
}
