import { describe, expect, it } from 'vitest';
import { ESCAPE_RANK, isEditable, layerToClose } from './escape';

describe('isEditable', () => {
  it('takes text inputs, text areas, selects and editable content', () => {
    expect(isEditable({ tagName: 'INPUT', type: 'search' })).toBe(true);
    expect(isEditable({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isEditable({ tagName: 'INPUT' })).toBe(true);
    expect(isEditable({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditable({ tagName: 'SELECT' })).toBe(true);
    expect(isEditable({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('leaves buttons, checkboxes and plain elements alone', () => {
    expect(isEditable({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isEditable({ tagName: 'INPUT', type: 'button' })).toBe(false);
    expect(isEditable({ tagName: 'BUTTON' })).toBe(false);
    expect(isEditable({ tagName: 'DIV' })).toBe(false);
    expect(isEditable(null)).toBe(false);
  });
});

describe('layerToClose', () => {
  const noop = () => undefined;
  const pane = { close: noop, rank: ESCAPE_RANK.pane };
  const sheet = { close: noop, rank: ESCAPE_RANK.sheet };
  const panel = { close: noop, rank: ESCAPE_RANK.activity };
  const row = { tagName: 'DIV' };

  it('closes the highest rank, whatever the order of registration', () => {
    expect(layerToClose([sheet, panel], 'Escape', false, row)).toBe(panel);
    expect(layerToClose([panel, sheet], 'Escape', false, row)).toBe(panel);
    // A reload of `#/playlist/<id>?d=<n>`: the sheet registers first.
    expect(layerToClose([sheet, pane], 'Escape', false, row)).toBe(sheet);
    expect(layerToClose([pane, sheet], 'Escape', false, row)).toBe(sheet);
    expect(layerToClose([pane], 'Escape', false, row)).toBe(pane);
  });

  it('closes the one opened last among equal ranks', () => {
    const other = { close: noop, rank: ESCAPE_RANK.sheet };
    expect(layerToClose([sheet, other], 'Escape', false, row)).toBe(other);
  });

  it('closes nothing without a layer, for another key, or once handled', () => {
    expect(layerToClose([], 'Escape', false, row)).toBeNull();
    expect(layerToClose([sheet], 'Enter', false, row)).toBeNull();
    expect(layerToClose([sheet], 'Escape', true, row)).toBeNull();
  });

  it('leaves Escape typed in a text field to the field', () => {
    const search = { tagName: 'INPUT', type: 'search' };
    expect(layerToClose([sheet], 'Escape', false, search)).toBeNull();
  });
});
