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

/** A gone answer whose new state this device could not read. */
export const UNCONFIRMED_NOTE =
  'The request had already moved on; Check now to see where it is';

/**
 * The note after a queue action (review F2): none when it took effect; for
 * a gone answer, `goneNote` from the status the pull that followed brought,
 * but only when that pull succeeded and the request no longer waits. A
 * failed pull leaves the old status, so nothing is guessed from it.
 */
export function queueNote(
  answer: string,
  pulled: boolean,
  statusAfterPull: MixJobView['status'] | undefined
): string | null {
  if (answer !== 'gone') return null;
  if (!pulled || statusAfterPull === 'queued') return UNCONFIRMED_NOTE;
  return goneNote(statusAfterPull);
}

/** A server without migration 0003 answers "column … does not exist" (42703). */
export function queueFailure(prefix: string, message: string): string {
  return /column\b.*does not exist|42703/i.test(message)
    ? MIGRATION_0003_MESSAGE
    : `${prefix}: ${message}`;
}
