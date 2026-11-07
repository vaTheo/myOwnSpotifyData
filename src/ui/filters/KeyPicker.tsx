import { useEffect, useRef, useState } from 'preact/hooks';
import { camelotNumber, formatKey, type KeySig } from '../../model/keys';
import { keyNotation } from '../../model/state';
import { Icon } from '../icons';

/** Camelot n (1..12) and its mode back to a pitch class: the wheel's inverse. */
function keyOfCamelot(n: number, major: boolean): KeySig {
  for (let key = 0; key < 12; key += 1) {
    if (camelotNumber(key, major) === n) return { key, major };
  }
  return { key: 0, major };
}

/**
 * The 24 keys laid out by Camelot number (research D12): two bands of six
 * numbers, minor (A) above major (B), so a key sits next to its neighbours
 * and above its relative.
 */
const BANDS: KeySig[][] = [1, 7].flatMap((start) =>
  [false, true].map((major) =>
    Array.from({ length: 6 }, (_, i) => keyOfCamelot(start + i, major))
  )
);

const same = (a: KeySig | null, b: KeySig) =>
  a !== null && a.key === b.key && a.major === b.major;

/**
 * The key filter (contracts/components.md): a button that opens a menu of
 * the 24 keys in the owner's notation, in their Camelot hues, with an
 * "Include compatible keys" switch and "Any key". Escape and a tap outside
 * close it, and the focus goes back to the button.
 */
export function KeyPicker(p: {
  value: KeySig | null;
  compatible: boolean;
  onChange: (key: KeySig | null, compatible: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const notation = keyNotation.value;
  const label = p.value
    ? `${formatKey(p.value.key, p.value.major, notation)}${p.compatible ? ' + compatible' : ''}`
    : 'Any key';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    // Fixed to the window under the button, so no table clips it; moved
    // left by what would overflow the window's right edge.
    const button =
      box.current?.querySelector<HTMLElement>('.key-picker-button');
    const menu = box.current?.querySelector<HTMLElement>('.key-menu');
    if (button && menu) {
      const b = button.getBoundingClientRect();
      const width = menu.getBoundingClientRect().width;
      const room = document.documentElement.clientWidth - 8 - width;
      menu.style.top = `${b.bottom + 4}px`;
      menu.style.left = `${Math.max(8, Math.min(b.left, room))}px`;
    }
    // A scroll or a resize would leave it behind: it closes.
    const close = (e: Event) => {
      if (e.type === 'scroll' && box.current?.contains(e.target as Node)) {
        return;
      }
      setOpen(false);
    };
    addEventListener('resize', close);
    addEventListener('scroll', close, true);
    // The chosen key takes the focus, else the first key.
    const keys = box.current?.querySelector('.key-menu');
    (
      keys?.querySelector<HTMLElement>('[aria-checked="true"]') ??
      keys?.querySelector<HTMLElement>('[role="radio"]')
    )?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      removeEventListener('resize', close);
      removeEventListener('scroll', close, true);
    };
  }, [open]);

  function close(): void {
    setOpen(false);
    box.current?.querySelector<HTMLElement>('.key-picker-button')?.focus();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!open) return;
    if (e.key === 'Escape') {
      // The menu's own Escape: the sheet or pane under it stays open.
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    const keys = [
      ...(box.current?.querySelectorAll<HTMLElement>('.key-menu-grid button') ??
        []),
    ];
    const at = keys.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const step =
      e.key === 'ArrowRight'
        ? 1
        : e.key === 'ArrowLeft'
          ? -1
          : e.key === 'ArrowDown'
            ? 6
            : e.key === 'ArrowUp'
              ? -6
              : 0;
    if (step === 0) return;
    e.preventDefault();
    keys[(at + step + keys.length) % keys.length]?.focus();
  }

  return (
    <div
      class="key-picker"
      ref={box}
      onKeyDown={onKeyDown}
      onFocusOut={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        class={p.value ? 'key-picker-button set' : 'key-picker-button'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span class="visually-hidden">Key: </span>
        <span>{label}</span>
        <Icon name="expand_more" size={18} />
      </button>
      {open && (
        <div class="key-menu" role="dialog" aria-label="Key filter">
          <div class="key-menu-grid" role="radiogroup" aria-label="Key">
            {BANDS.flat().map((k) => {
              const n = camelotNumber(k.key, k.major);
              const checked = same(p.value, k);
              return (
                <button
                  type="button"
                  key={`${n}${k.major}`}
                  role="radio"
                  aria-checked={checked}
                  class={`key-choice pill key-${n} ${k.major ? 'major' : 'minor'}${checked ? ' checked' : ''}`}
                  onClick={() => {
                    p.onChange(k, p.compatible);
                    close();
                  }}
                >
                  {formatKey(k.key, k.major, notation)}
                </button>
              );
            })}
          </div>
          <label class="key-menu-switch">
            <input
              type="checkbox"
              role="switch"
              checked={p.compatible}
              onChange={(e) =>
                p.onChange(
                  p.value,
                  (e.currentTarget as HTMLInputElement).checked
                )
              }
            />
            <span>Include compatible keys</span>
          </label>
          <button
            type="button"
            class="key-menu-any"
            disabled={p.value === null}
            onClick={() => {
              p.onChange(null, p.compatible);
              close();
            }}
          >
            Any key
          </button>
        </div>
      )}
    </div>
  );
}
