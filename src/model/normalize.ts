export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function nameKey(artist: string, title: string): string {
  return `${normalize(artist)}|${normalize(title)}`;
}
