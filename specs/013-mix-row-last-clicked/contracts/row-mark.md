# Contract: the marked row

| Event | Result |
|---|---|
| click on a cell, text, link, icon button, menu button, Enter/Space on a control in the row, or Enter/Space on the focused row | that row is marked; the control's own action still happens |
| click on the marked row again | stays marked |
| click outside the tracklist | mark unchanged |
| sort, filter, window resize | same track stays marked (hidden by a filter: none visible) |
| Delete any row, open another mix, reload | no row marked |
| a paste, Replace with description, a lookup, the same mix reopened (every row replaced, `mixRowsReplaced`) | no row marked |
| Add track | the new row is marked |
| open Edit or Link form on the marked row | form row shows the edge bar, keeps neutral fill |

Glow: top and bottom lines are 2 px (`--app-mark-line`) `--md-sys-color-primary` with a soft halo (`0 0 8px`, `--app-mark-halo`, `primary` about 60%), drawn as shadows, row `position: relative` (lifted above its neighbours, no z-index so no stacking context: an open More menu stays above banners and bars), no layout shift; the Edit/Link form row and the phone item get the same lines. The bottom line reaches the row's edge: the row's 1 px bottom border takes `primary` and the inset shadow draws the other `--app-mark-line` minus 1 px.
Look: fill `--md-sys-color-primary-container`, text `--md-sys-color-on-primary-container`, status marks keep their own tokens, 4 px (`--app-mark-bar`) left bar `--md-sys-color-primary` (inset shadow, no layout shift), `aria-selected="true"`, hover = layer over the selected fill, focus ring `--md-sys-color-on-surface` (3 px, inset by bar + ring + line, so a band of the fill parts it from the bar and lines). Forced-colors: row outline.
Contrast pairs asserted: on-surface, on-surface-variant, error (4.5: the phone "Not found on Spotify" is text), app-color-warning, secondary on primary-container, primary on it at 3; `outline` on it is not used (form row is neutral).
