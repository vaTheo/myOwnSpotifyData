import { describe, expect, it } from 'vitest';
import { tabStop } from './compareFocus';

describe('tabStop', () => {
  it('keeps the remembered item when it exists', () => {
    expect(tabStop({ col: 1, index: 2 }, [5, 5, 5])).toEqual({
      col: 1,
      index: 2,
    });
  });

  it('clamps the index to the last item of its column', () => {
    expect(tabStop({ col: 0, index: 9 }, [3, 5, 5])).toEqual({
      col: 0,
      index: 2,
    });
  });

  it('clamps the column to the last one', () => {
    expect(tabStop({ col: 7, index: 0 }, [3, 5, 5])).toEqual({
      col: 2,
      index: 0,
    });
  });

  it('moves to the first column with items when the remembered one is empty', () => {
    expect(tabStop({ col: 0, index: 4 }, [0, 3, 5])).toEqual({
      col: 1,
      index: 0,
    });
  });

  it('is null when no column has an item', () => {
    expect(tabStop({ col: 0, index: 0 }, [0, 0, 0])).toBeNull();
  });
});
