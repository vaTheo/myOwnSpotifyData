# Contract: the marked row

| Event | Result |
|---|---|
| click on a cell, text, link, icon button, menu button, or Enter/Space on a control in the row | that row is marked; the control's own action still happens |
| click on the marked row again | stays marked |
| click outside the tracklist | mark unchanged |
| sort, filter, window resize | same track stays marked (hidden by a filter: none visible) |
| Delete the marked row, open another mix, reload | no row marked |
| Add track | the new row is marked |
| open Edit or Link form on the marked row | form row shows the edge bar, keeps neutral fill |

Glow: top and bottom lines are 2 px `--md-sys-color-primary` with a soft halo (`0 0 8px`, `primary` about 60%), drawn as shadows, row `position: relative; z-index: 1`, no layout shift; the Edit/Link form row and the phone item get the same lines.
Look: fill `--md-sys-color-primary-container`, text `--md-sys-color-on-primary-container`, status marks keep their own tokens, 4 px left bar `--md-sys-color-primary` (inset shadow, no layout shift), `aria-selected="true"`, hover = layer over the selected fill, focus ring unchanged. Forced-colors: row outline.
Contrast pairs asserted: on-surface, on-surface-variant, error, app-color-warning, secondary on primary-container; `outline` on it is not used (form row is neutral).
