import { msg } from '../i18n';

/** Turns a caught value into a user-facing message. */
export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Same as `describeError`, but a quota-exceeded `DOMException` (an
 * IndexedDB or localStorage write over the browser's cap) gets a message
 * the owner can act on instead of the raw exception text.
 */
export function storageMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return msg().sources.storageFull;
  }
  return describeError(err);
}
