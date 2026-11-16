import { describe, expect, it } from 'vitest';
import { en } from './en';
import { fr } from './fr';

/**
 * The two catalogues say the same things (spec 031, FR-017): no text in one
 * language only, none empty, none left in English by mistake.
 */
type Node = string | ((...args: never[]) => string) | { [key: string]: Node };

/** Texts that are the same word in both languages (contracts/glossary.md). */
const SAME = new Set([
  'Spotify',
  'Mix',
  'Top',
  'Crate',
  'BPM',
  'Playlists',
  'Import',
  'Français',
  'English',
  'Playlist',
  'playlist',
  'playlists',
  'Fans',
  'Label',
  'Tracklist',
  'Album',
  'album',
  'Audio',
  'Source',
  'Total',
]);

interface Leaf {
  path: string;
  en: Node;
  fr: Node | undefined;
}

function leaves(a: Node, b: Node | undefined, path: string): Leaf[] {
  if (typeof a === 'string' || typeof a === 'function') {
    return [{ path, en: a, fr: b }];
  }
  const other = typeof b === 'object' ? b : {};
  return Object.keys(a).flatMap((key) =>
    leaves(a[key], other[key], path ? `${path}.${key}` : key)
  );
}

function keys(node: Node, path: string): string[] {
  if (typeof node !== 'object') return [path];
  return Object.keys(node).flatMap((key) =>
    keys(node[key], path ? `${path}.${key}` : key)
  );
}

/** A function entry called with each count, or with sample words. */
function outputs(fn: (...args: never[]) => string): string[] {
  const call = fn as unknown as (...args: unknown[]) => string;
  return [0, 1, 2].map((n) =>
    call(...Array.from({ length: Math.max(fn.length, 1) }, () => n))
  );
}

const ALL = leaves(en as unknown as Node, fr as unknown as Node, '');

describe('the English and French catalogues (spec 031)', () => {
  it('hold the same entries', () => {
    expect(keys(fr as unknown as Node, '').sort()).toEqual(
      keys(en as unknown as Node, '').sort()
    );
  });

  it('give each entry the same kind in both languages', () => {
    for (const leaf of ALL) {
      expect(typeof leaf.fr, leaf.path).toBe(typeof leaf.en);
    }
  });

  it('leave no text empty', () => {
    for (const leaf of ALL) {
      for (const node of [leaf.en, leaf.fr]) {
        const texts =
          typeof node === 'function' ? outputs(node) : [node as string];
        for (const text of texts) {
          expect(text.trim(), leaf.path).not.toBe('');
        }
      }
    }
  });

  it('leave no English sentence in the French catalogue', () => {
    const left = ALL.filter(
      (leaf) =>
        typeof leaf.en === 'string' && leaf.en === leaf.fr && !SAME.has(leaf.en)
    ).map((leaf) => leaf.path);
    expect(left).toEqual([]);
  });

  it('agree a counted noun in English: only 1 is singular', () => {
    expect(en.n.track(0)).toBe('0 tracks');
    expect(en.n.track(1)).toBe('1 track');
    expect(en.n.track(2)).toBe('2 tracks');
    expect(en.n.play(1234)).toBe('1,234 plays');
  });

  it('agree a counted noun in French: 0 and 1 are singular', () => {
    expect(fr.n.track(0)).toBe('0 titre');
    expect(fr.n.track(1)).toBe('1 titre');
    expect(fr.n.track(2)).toBe('2 titres');
    expect(fr.n.play(1234)).toBe('1 234 écoutes');
    expect(fr.n.month(3)).toBe('3 mois');
  });

  it('keep the English wording word for word (FR-003)', () => {
    expect(en.settings.danger.confirm).toBe(
      'Disconnect and delete all local data? Server data is kept.'
    );
    expect(en.format.top.ranking).toBe(
      "Spotify's own ranking for this period."
    );
    expect(en.format.noReach).toBe('no reach data');
    expect(en.format.wikipedia(19)).toBe('Wikipedia · 19 languages');
    expect(en.format.notCounted.line('22 under 30 s')).toBe(
      'Not counted: 22 under 30 s'
    );
    expect(en.language.kept).toBe('Kept on this device.');
    expect(en.settings.items.sync).toBe('Spotify sync');
  });

  it('keep every confirm() question of how-it-works §14 word for word', () => {
    const texts = new Set(
      ALL.filter((leaf) => typeof leaf.en === 'string').map((leaf) => leaf.en)
    );
    for (const question of [
      'Disconnect and delete all local data? Server data is kept.',
      'Remove this saved mix?',
      'This is a different Spotify account. Delete all local data for the previous account?',
      'Cancel this request? It leaves the queue; you can ask again later.',
      "Delete this mix forever? Its saved tracks and request history are removed and can't be restored.",
      'Remove all your data from the server? Local data on this browser is kept.',
      'Replace your edited tracklist with the one from the description?',
      'Looking up again replaces the current tracklist, including your edits. Continue?',
      'Replace your edited tracklist with the pasted tracks?',
      'Importing this file replaces the current tracklist, including your edits. Continue?',
      'Stop this scan? The computer ends it within about a minute and keeps the tracks found so far.',
    ]) {
      expect(texts.has(question), question).toBe(true);
    }
    expect(en.sources.like.question(1, 2)).toBe(
      "1 of 2 songs from your last sync isn't in your Liked Songs yet. Like it?"
    );
    expect(en.sources.like.question(2, 3)).toBe(
      "2 of 3 songs from your last sync aren't in your Liked Songs yet. Like them?"
    );
  });
});
