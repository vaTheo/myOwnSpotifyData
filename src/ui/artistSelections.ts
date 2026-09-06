import { signal } from '@preact/signals';
import type { ReachSort } from '../model/reach';

export type ArtistView = 'saved' | 'radar';

// Module level, so a tab switch keeps each setting and a reload resets it
// (spec §5.1), on the precedent of `ui/crate/selections.ts`. They earn their
// own file here beyond that convention: `Artists.tsx` renders the view
// switcher and `UnderRadar.tsx` reads the view and the sort, so putting them
// in either component would make the dispatcher and the view import each
// other. The Saved tracks filter stays in `Artists.tsx`, since only that
// screen reads it.
export const artistView = signal<ArtistView>('saved');
export const radarSort = signal<ReachSort>('plays');
export const radarFilter = signal('');
