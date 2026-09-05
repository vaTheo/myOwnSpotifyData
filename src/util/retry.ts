export const MAX_5XX_RETRIES = 3;

export function backoffMs(attempt: number): number {
  return Math.min(2000 * 2 ** (attempt - 1), 60_000);
}

/** An absent or blank header is unreadable, not "retry immediately". */
export function parseRetryAfter(header: string | null): number | null {
  if (header === null || header.trim() === '') return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}
