/**
 * The `accept` rule of a file input, applied to a dropped file: the system
 * picker filters by `accept`, a drop does not (spec 003, FR-039). An entry
 * is an extension (`.zip`, any case), an exact type or a `type/*` wildcard.
 */
export function acceptsFile(
  file: { name: string; type: string },
  accept: string
): boolean {
  const entries = accept
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (entries.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return entries.some((entry) => {
    if (entry.startsWith('.')) return name.endsWith(entry);
    if (entry.endsWith('/*')) return type.startsWith(entry.slice(0, -1));
    return type !== '' && type === entry;
  });
}

/** The extensions of `accept`, for a message: ".zip or .json". */
export function acceptLabel(accept: string): string {
  const exts = accept
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.startsWith('.'));
  if (exts.length <= 1) return exts[0] ?? 'matching';
  return `${exts.slice(0, -1).join(', ')} or ${exts[exts.length - 1]}`;
}
