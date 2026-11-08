/**
 * The Mix tracklist's marked row (spec 013, contracts/row-mark.md): the
 * last row clicked, an index into `mixRows` (not a place in the view), or
 * null. Component state only: never stored, never synced.
 */
export type RowMarkEvent =
  | { type: 'click'; index: number }
  | { type: 'delete'; index: number }
  | { type: 'add'; index: number }
  | { type: 'open-mix' }
  | { type: 'rows-replaced' };

/** The marked row after `event`. */
export function markAfter(
  marked: number | null,
  event: RowMarkEvent
): number | null {
  switch (event.type) {
    case 'click':
    case 'add':
      return event.index;
    // A delete shifts the rows after it: any mark would point at another
    // track, so none stays. A paste, the description or a saved mix
    // reopened replaces every row without changing the mix: same reason.
    case 'delete':
    case 'open-mix':
    case 'rows-replaced':
      return null;
  }
}
