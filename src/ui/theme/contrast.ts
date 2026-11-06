/**
 * WCAG 2.x contrast between two sRGB colours, and a reader for the hex
 * custom properties of `tokens.css`. Used by the token test (spec 003,
 * research D17), so every colour pair the design relies on stays readable.
 */

function channels(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 1 (same colour) to 21 (black on white); the order of the two is free. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** `--name: #hex;` declarations; anything that is not a hex colour is skipped. */
export function parseTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(
    /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g
  )) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}
