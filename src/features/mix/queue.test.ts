import { describe, expect, it } from 'vitest';
import { goneNote, MIGRATION_0003_MESSAGE, queueFailure } from './queue';

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
