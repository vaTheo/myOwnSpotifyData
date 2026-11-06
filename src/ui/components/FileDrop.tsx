import { useState } from 'preact/hooks';
import { Icon } from '../icons';

/**
 * A file picker that also takes a dropped file (spec 003, FR-039). The
 * whole area is the `<label>` of a hidden file input, so a click, Enter or
 * Space opens the system picker; dropping a file hands it to `onFile` the
 * same way. The drop hint is shown from medium windows up (CSS).
 */
export function FileDrop(p: {
  label: string;
  hint?: string;
  accept: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <label
      class={['file-drop', over ? 'over' : '', p.disabled ? 'disabled' : '']
        .filter(Boolean)
        .join(' ')}
      onDragOver={(e) => {
        if (p.disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer?.files?.[0];
        if (file && !p.disabled) p.onFile(file);
      }}
    >
      <Icon name="upload_file" size={28} />
      <span class="file-drop-label">{p.label}</span>
      {p.hint && <span class="file-drop-hint">{p.hint}</span>}
      <input
        type="file"
        accept={p.accept}
        disabled={p.disabled}
        onChange={(e) => {
          const input = e.currentTarget as HTMLInputElement;
          const file = input.files?.[0];
          input.value = '';
          if (file) p.onFile(file);
        }}
      />
    </label>
  );
}
