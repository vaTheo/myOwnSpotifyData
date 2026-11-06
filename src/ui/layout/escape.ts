/**
 * Escape closes one layer at a time (spec 003, FR-043): the Activity panel,
 * the details sheet, the detail pane of a list–detail screen. Each layer
 * registers while it is open; one document listener closes only the
 * topmost, the one opened last. A key pressed in a text field is the
 * field's (a search field clears itself on Escape), so it closes nothing.
 */

export type EscapeLayer = () => void;

/** What `isEditable` reads of an element; a DOM element has all of it. */
export interface EditableLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
}

const NOT_TEXT = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** A field that takes typing, where Escape belongs to the field. */
export function isEditable(target: EditableLike | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName?.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag !== 'input') return false;
  return !NOT_TEXT.has((target.type ?? 'text').toLowerCase());
}

/**
 * The layer one Escape closes, or null when the key is not for the layers:
 * another key, a key a component already handled, a key typed in a field,
 * or no layer open.
 */
export function layerToClose(
  layers: readonly EscapeLayer[],
  key: string,
  defaultPrevented: boolean,
  target: EditableLike | null | undefined
): EscapeLayer | null {
  if (key !== 'Escape' || defaultPrevented || isEditable(target)) return null;
  return layers.length > 0 ? layers[layers.length - 1] : null;
}

const layers: EscapeLayer[] = [];
let installed = false;

function onKey(e: KeyboardEvent): void {
  const close = layerToClose(
    layers,
    e.key,
    e.defaultPrevented,
    e.target as EditableLike | null
  );
  if (!close) return;
  e.preventDefault();
  close();
}

/** Registers an open layer; the returned function unregisters it. */
export function pushEscapeLayer(close: EscapeLayer): () => void {
  if (!installed && typeof document !== 'undefined') {
    document.addEventListener('keydown', onKey);
    installed = true;
  }
  // A wrapper per registration, so the same function pushed twice is
  // removed once per pop.
  const layer: EscapeLayer = () => close();
  layers.push(layer);
  return () => {
    const at = layers.lastIndexOf(layer);
    if (at >= 0) layers.splice(at, 1);
  };
}
