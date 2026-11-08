import { describe, expect, it } from 'vitest';
import { afterLink, gateNotice, signInRequired } from './gate';

describe('signInRequired (round 009, FR-002, FR-008)', () => {
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

describe('gateNotice', () => {
  it('shows a link error as it is', () => {
    expect(
      gateNotice({ status: 'error', message: 'Open the link in this browser.' })
    ).toEqual({
      kind: 'error',
      text: 'Open the link in this browser.',
    });
  });

  it('says the server is offline, with its reason', () => {
    expect(gateNotice({ status: 'offline', message: 'No network.' })).toEqual({
      kind: 'warning',
      text: 'Server offline: No network. Send the link again once you are online.',
    });
  });

  it('says the server is paused, with the dashboard', () => {
    expect(
      gateNotice({ status: 'paused', dashboardUrl: 'https://d.example' })
    ).toEqual({ kind: 'paused', dashboardUrl: 'https://d.example' });
  });

  it('says nothing when signed out with no failure', () => {
    expect(gateNotice({ status: 'signedOut' })).toBeNull();
    expect(gateNotice({ status: 'unset' })).toBeNull();
  });
});
