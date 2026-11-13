import { signal } from '@preact/signals';
import type { ReachSort } from '../model/reach';

export type ArtistView = 'saved' | 'radar';

// Module level, so a tab switch keeps each setting and a reload resets it
// (spec §5.1), on the precedent of `ui/crate/selections.ts`. They earn their
// own file here beyond that convention: `Artists.tsx` renders the view
// switcher and `UnderRadar.tsx` reads the view, the sort and the filter, so
// putting them in either component would make the dispatcher and the view
// import each other. The "Filter artists" text is one value for both views
// (spec 030, FR-016): it survives a view switch.
export const artistView = signal<ArtistView>('saved');
export const radarSort = signal<ReachSort>('plays');
export const artistFilter = signal('');
