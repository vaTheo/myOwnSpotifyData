import { useState } from 'preact/hooks';
import { Icon } from '../icons';
import { acceptLabel, acceptsFile } from './fileAccept';
import { StatusLine } from './StatusLine';

/**
 * A file picker that also takes a dropped file (spec 003, FR-039). The
 * whole area is the `<label>` of a hidden file input, so a click, Enter or
 * Space opens the system picker; dropping a file hands it to `onFiles` the
 * same way. Without `multiple` only the first file is passed on. The picker
 * filters by `accept`; a drop is checked against it here, and a drop with a
 * file of another type is refused whole, with an inline message under the
 * area. The drop hint is shown from medium windows up (CSS).
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
  const [refused, setRefused] = useState<string | null>(null);
  const pick = (list: FileList | null | undefined): File[] => {
    const files = Array.from(list ?? []);
    return p.multiple ? files : files.slice(0, 1);
  };
  const pass = (files: File[]) => {
    setRefused(null);
    if (files.length > 0) p.onFiles(files);
  };
  return (
    <>
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
          if (p.disabled) return;
          const files = pick(e.dataTransfer?.files);
          const wrong = files.find((f) => !acceptsFile(f, p.accept));
          if (wrong) {
            setRefused(
              `${wrong.name} cannot be used here: drop a ${acceptLabel(p.accept)} file.`
            );
            return;
          }
          pass(files);
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
            const files = pick(input.files);
            input.value = '';
            pass(files);
          }}
        />
      </label>
      {refused && <StatusLine kind="error">{refused}</StatusLine>}
    </>
  );
}
