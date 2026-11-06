import { describe, expect, it } from 'vitest';
import {
  goneNote,
  MIGRATION_0003_MESSAGE,
  queueFailure,
  queueNote,
  UNCONFIRMED_NOTE,
} from './queue';

describe('goneNote (ruling D4)', () => {
  it('says the computer took a request that is now running', () => {
    expect(goneNote('claimed')).toBe('Already taken by your computer');
  });

  it('says a done, failed or no longer listed request is finished', () => {
    expect(goneNote('done')).toBe('Already finished');
    expect(goneNote('failed')).toBe('Already finished');
    expect(goneNote(undefined)).toBe('Already finished');
  });
});

describe('queueFailure (ruling D5)', () => {
  it('names migration 0003 when a column does not exist', () => {
    expect(
      queueFailure(
        'Could not move the request',
        'column jobs.priority does not exist'
      )
    ).toBe(MIGRATION_0003_MESSAGE);
    expect(queueFailure('Could not stop the scan', 'Error 42703')).toBe(
      'Apply migration 0003 on the server to use Cancel, Move to top and Stop'
    );
  });

  it("keeps today's words for any other failure", () => {
    expect(
      queueFailure('Could not cancel the request', 'The server is unreachable')
    ).toBe('Could not cancel the request: The server is unreachable');
  });
});

describe('queueNote (T122, review F2)', () => {
  it('says nothing when the action took effect', () => {
    expect(queueNote('cancelled', true, undefined)).toBeNull();
    expect(queueNote('moved', true, 'queued')).toBeNull();
    expect(queueNote('asked', false, 'claimed')).toBeNull();
  });

  it('words a gone answer from the status the pull brought', () => {
    expect(queueNote('gone', true, 'claimed')).toBe(
      'Already taken by your computer'
    );
    expect(queueNote('gone', true, 'done')).toBe('Already finished');
    expect(queueNote('gone', true, undefined)).toBe('Already finished');
  });

  it('never guesses from a stale status when the pull failed', () => {
    expect(queueNote('gone', false, 'queued')).toBe(UNCONFIRMED_NOTE);
    expect(queueNote('gone', false, 'claimed')).toBe(UNCONFIRMED_NOTE);
  });

  it('does not call a request still waiting finished', () => {
    expect(queueNote('gone', true, 'queued')).toBe(UNCONFIRMED_NOTE);
  });
});
