/** Exact origin match. There is no wildcard and no reflected CORS origin. */

export function originAllowed(
  origin: string | undefined,
  allowed: readonly string[],
): boolean {
  if (origin === undefined || origin === "") {
    return false;
  }
  return allowed.includes(origin);
}

export function headerText(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return undefined;
  }
  return value;
}
