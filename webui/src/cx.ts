/**
 * Join class names, dropping anything falsy.
 *
 * CSS Module lookups are typed `string | undefined` under `noUncheckedIndexedAccess`,
 * which is correct — a typo in a class name really does yield undefined. This keeps that
 * check on instead of loosening tsconfig to silence it.
 */
export function cx(...parts: (string | undefined | false | null)[]): string {
  return parts.filter(Boolean).join(" ");
}
