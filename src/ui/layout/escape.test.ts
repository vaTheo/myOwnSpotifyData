import { describe, expect, it } from 'vitest';
import { isEditable, layerToClose } from './escape';

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
  const sheet = () => undefined;
  const panel = () => undefined;
  const row = { tagName: 'DIV' };

  it('closes only the layer opened last', () => {
    expect(layerToClose([sheet, panel], 'Escape', false, row)).toBe(panel);
    expect(layerToClose([sheet], 'Escape', false, row)).toBe(sheet);
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
