import { describe, expect, it } from 'vitest';
import { describeError, storageMessage } from './errors';

describe('describeError', () => {
  it('reads the message off an Error', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('stringifies a non-Error value', () => {
    expect(describeError('nope')).toBe('nope');
    expect(describeError(42)).toBe('42');
  });
});

describe('storageMessage', () => {
  it('gives the storage-full copy for a QuotaExceededError DOMException', () => {
    const err = new DOMException('x', 'QuotaExceededError');
    expect(storageMessage(err)).toBe(
      'Local storage is full. Free space on the phone and try again.'
    );
  });

  it('falls back to describeError for a plain Error', () => {
    const err = new Error('disk read failed');
    expect(storageMessage(err)).toBe(describeError(err));
    expect(storageMessage(err)).toBe('disk read failed');
  });

  it('falls back to describeError for a non-quota DOMException', () => {
    const err = new DOMException('nope', 'NotFoundError');
    expect(storageMessage(err)).toBe(describeError(err));
  });
});
