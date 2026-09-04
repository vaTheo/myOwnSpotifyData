/** Audio files carry a numeric suffix; Video files do not. */
export const HISTORY_FILE =
  /^Streaming_History_(Audio|Video)_\d{4}(?:-\d{4})?(?:_(\d+))?\.json$/i;

const ACCOUNT_DATA_FILE =
  /^StreamingHistory_(music|podcast|audiobook)_\d+\.json$/i;

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function isHistoryFile(path: string): boolean {
  return HISTORY_FILE.test(baseName(path));
}

/** Numeric suffix, or MAX_SAFE_INTEGER for suffix-less (Video) files so they sort last. */
export function historyFileIndex(path: string): number {
  const match = HISTORY_FILE.exec(baseName(path));
  return match?.[2] !== undefined ? Number(match[2]) : Number.MAX_SAFE_INTEGER;
}

export function sortHistoryFiles<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort(
    (a, b) =>
      historyFileIndex(a.name) - historyFileIndex(b.name) ||
      a.name.localeCompare(b.name)
  );
}

export function isAccountDataFile(path: string): boolean {
  return ACCOUNT_DATA_FILE.test(baseName(path));
}

export function isAccountDataRecord(record: unknown): boolean {
  if (!record || typeof record !== 'object') return false;
  return 'endTime' in record || 'msPlayed' in record;
}
