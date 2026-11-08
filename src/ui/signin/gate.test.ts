import { describe, expect, it } from 'vitest';
import {
  SPOTIFY_BEFORE_SIGNIN_MESSAGE,
  afterLink,
  connectSignOutShown,
  gateNotices,
  signInRequired,
  syncOnOpen,
} from './gate';

describe('signInRequired (round 011, FR-002, FR-008)', () => {
  it('gates a configured server with nobody signed in', () => {
    expect(
      signInRequired({ configured: true, demo: false, signedIn: false })
    ).toBe(true);
  });

  it('lets a signed-in user through', () => {
    expect(
      signInRequired({ configured: true, demo: false, signedIn: true })
    ).toBe(false);
  });

  it('never gates without server settings (FR-008)', () => {
    expect(
      signInRequired({ configured: false, demo: false, signedIn: false })
    ).toBe(false);
  });

  it('never gates the demo, even with the fake server address', () => {
    expect(
      signInRequired({ configured: true, demo: true, signedIn: false })
    ).toBe(false);
  });
});

describe('afterLink', () => {
  it('a working link loads the page again, without the code', () => {
    expect(afterLink('ok')).toBe('navigate');
    expect(afterLink('reload')).toBe('navigate');
    expect(afterLink('none')).toBe('navigate');
  });

  it('a failed link stays on this page, so its message is shown', () => {
    expect(afterLink('invalid')).toBe('stay');
  });
});

describe('gateNotices', () => {
  it('shows a link error as it is', () => {
    expect(
      gateNotices(
        { status: 'error', message: 'Open the link in this browser.' },
        false
      )
    ).toEqual([{ kind: 'error', text: 'Open the link in this browser.' }]);
  });

  it('says the server is offline, with its reason', () => {
    expect(
      gateNotices({ status: 'offline', message: 'No network.' }, false)
    ).toEqual([
      {
        kind: 'warning',
        text: 'Server offline: No network. Send the link again once you are online.',
      },
    ]);
  });

  it('says the server is paused, with the dashboard', () => {
    expect(
      gateNotices(
        { status: 'paused', dashboardUrl: 'https://d.example' },
        false
      )
    ).toEqual([{ kind: 'paused', dashboardUrl: 'https://d.example' }]);
  });

  it('says nothing when signed out with no failure', () => {
    expect(gateNotices({ status: 'signedOut' }, false)).toEqual([]);
    expect(gateNotices({ status: 'unset' }, false)).toEqual([]);
  });

  it('says a Spotify return was not used, beside a server error', () => {
    expect(gateNotices({ status: 'signedOut' }, true)).toEqual([
      { kind: 'error', text: SPOTIFY_BEFORE_SIGNIN_MESSAGE },
    ]);
    expect(
      gateNotices({ status: 'error', message: 'Bad link.' }, true)
    ).toEqual([
      { kind: 'error', text: 'Bad link.' },
      { kind: 'error', text: SPOTIFY_BEFORE_SIGNIN_MESSAGE },
    ]);
  });
});

describe('syncOnOpen', () => {
  it('a failed link holds the open sync, so its message stays', () => {
    expect(syncOnOpen('invalid')).toBe(false);
  });

  it('every other open syncs as before', () => {
    expect(syncOnOpen(null)).toBe(true);
    expect(syncOnOpen('none')).toBe(true);
    expect(syncOnOpen('ok')).toBe(true);
  });
});

describe('connectSignOutShown (round 011, final review I1)', () => {
  it('shows Sign out on Connect with a server and a session', () => {
    expect(
      connectSignOutShown({ configured: true, demo: false, signedIn: true })
    ).toBe(true);
  });

  it('never without server settings', () => {
    expect(
      connectSignOutShown({ configured: false, demo: false, signedIn: true })
    ).toBe(false);
  });

  it('never without a server session', () => {
    expect(
      connectSignOutShown({ configured: true, demo: false, signedIn: false })
    ).toBe(false);
  });

  it('never in the demo, which never talks to the server', () => {
    expect(
      connectSignOutShown({ configured: true, demo: true, signedIn: true })
    ).toBe(false);
  });
});
