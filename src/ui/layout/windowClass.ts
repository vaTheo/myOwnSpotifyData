import { signal } from '@preact/signals';

/**
 * Material 3's window size classes (spec 003, research D6). CSS does the
 * layout with the same breakpoints; this signal is for behaviour only:
 * whether a selection opens a pane or a full screen, which navigation draws.
 */
export type WindowClass = 'compact' | 'medium' | 'expanded' | 'large';

export const BREAKPOINTS = { medium: 600, expanded: 840, large: 1200 } as const;

export function windowClassOf(width: number): WindowClass {
  if (width >= BREAKPOINTS.large) return 'large';
  if (width >= BREAKPOINTS.expanded) return 'expanded';
  if (width >= BREAKPOINTS.medium) return 'medium';
  return 'compact';
}

function current(): WindowClass {
  return typeof window === 'undefined'
    ? 'large'
    : windowClassOf(window.innerWidth);
}

export const windowClass = signal<WindowClass>(current());

// One listener per breakpoint: they fire only when a boundary is crossed,
// never on every pixel of a resize.
if (typeof window !== 'undefined' && typeof matchMedia === 'function') {
  for (const width of Object.values(BREAKPOINTS)) {
    matchMedia(`(min-width: ${width}px)`).addEventListener('change', () => {
      windowClass.value = current();
    });
  }
}
