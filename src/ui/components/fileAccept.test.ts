import { describe, expect, it } from 'vitest';
import { acceptLabel, acceptsFile } from './fileAccept';

const ZIP = '.zip,.json,application/zip,application/json';
const XML = '.xml,text/xml,application/xml';

describe('acceptsFile', () => {
  it('matches an extension, whatever its case', () => {
    expect(acceptsFile({ name: 'my_spotify_data.ZIP', type: '' }, ZIP)).toBe(
      true
    );
    expect(acceptsFile({ name: 'rekordbox.xml', type: '' }, XML)).toBe(true);
  });

  it('matches an exact type or a wildcard type', () => {
    expect(
      acceptsFile({ name: 'collection', type: 'application/xml' }, XML)
    ).toBe(true);
    expect(acceptsFile({ name: 'a', type: 'image/png' }, 'image/*')).toBe(true);
  });

  it('refuses anything else', () => {
    expect(
      acceptsFile({ name: 'my_spotify_data.zip', type: 'application/zip' }, XML)
    ).toBe(false);
    expect(
      acceptsFile({ name: 'notes.xml.txt', type: 'text/plain' }, XML)
    ).toBe(false);
  });

  it('takes anything when there is no accept list', () => {
    expect(acceptsFile({ name: 'a.bin', type: '' }, '')).toBe(true);
  });
});

describe('acceptLabel', () => {
  it('names the extensions the area takes', () => {
    expect(acceptLabel(ZIP)).toBe('.zip or .json');
    expect(acceptLabel(XML)).toBe('.xml');
    expect(acceptLabel('.a,.b,.c')).toBe('.a, .b or .c');
  });
});
