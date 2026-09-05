import type { Route } from '../router';

/** Red for a failure, amber for a warning or a neutral notice. */
export type BannerKind = 'error' | 'warn';

export interface BannerMessage {
  text: string;
  kind: BannerKind;
  /**
   * The screens whose own cards already print this message, with or without
   * a "Last error:" prefix. The banner stays off there rather than spending
   * a sixth of the viewport repeating text the screen is already showing.
   */
  inlineOn: Route['name'][];
}

export function errorBanner(
  text: string,
  inlineOn: Route['name'][] = []
): BannerMessage {
  return { text, kind: 'error', inlineOn };
}

/** Warnings and notices are never duplicated by a card, so they always show. */
export function warnBanner(text: string): BannerMessage {
  return { text, kind: 'warn', inlineOn: [] };
}

/** What the banner slot should render on this screen, if anything. */
export function visibleBanner(
  message: BannerMessage | null,
  route: Route['name']
): BannerMessage | null {
  if (!message) return null;
  return message.inlineOn.includes(route) ? null : message;
}
