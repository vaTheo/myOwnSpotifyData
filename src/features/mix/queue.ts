import type { MixJobView } from '../../db/schema';

/**
 * The words of the queue actions' outcomes (spec 003 §12, T122, rulings D4
 * and D5), shown inline in the Mixes pane, never as a banner.
 */

export const MIGRATION_0003_MESSAGE =
  'Apply migration 0003 on the server to use Cancel, Move to top and Stop';

/**
 * Cancel, Move to top or Stop found the request already moved on: its
 * status after the pull that follows, or undefined when no longer listed.
 */
export function goneNote(
  statusAfterPull: MixJobView['status'] | undefined
): string {
  return statusAfterPull === 'claimed'
    ? 'Already taken by your computer'
    : 'Already finished';
}

/** A server without migration 0003 answers "column … does not exist" (42703). */
export function queueFailure(prefix: string, message: string): string {
  return /column\b.*does not exist|42703/i.test(message)
    ? MIGRATION_0003_MESSAGE
    : `${prefix}: ${message}`;
}
