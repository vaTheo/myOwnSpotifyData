import { useState } from 'preact/hooks';
import { Icon } from '../icons';

/**
 * A file picker that also takes a dropped file (spec 003, FR-039). The
 * whole area is the `<label>` of a hidden file input, so a click, Enter or
 * Space opens the system picker; dropping a file hands it to `onFiles` the
 * same way. Without `multiple` only the first file is passed on. The drop
 * hint is shown from medium windows up (CSS).
 */
export function FileDrop(p: {
  label: string;
  hint?: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const [over, setOver] = useState(false);
  const pass = (list: FileList | null | undefined) => {
    const files = Array.from(list ?? []);
    const picked = p.multiple ? files : files.slice(0, 1);
    if (picked.length > 0) p.onFiles(picked);
  };
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
        if (!p.disabled) pass(e.dataTransfer?.files);
      }}
    >
      <Icon name="upload_file" size={28} />
      <span class="file-drop-label">{p.label}</span>
      {p.hint && <span class="file-drop-hint">{p.hint}</span>}
      <input
        type="file"
        accept={p.accept}
        multiple={p.multiple}
        disabled={p.disabled}
        onChange={(e) => {
          const input = e.currentTarget as HTMLInputElement;
          const files = input.files;
          pass(files);
          input.value = '';
        }}
      />
    </label>
  );
}
