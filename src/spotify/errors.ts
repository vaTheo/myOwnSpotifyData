import { msg } from '../i18n';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown = null
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type AuthFailure =
  'missing' | 'expired' | 'state' | 'verifier' | 'denied';

export class AuthError extends Error {
  constructor(
    public readonly reason: AuthFailure,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class NotAllowlistedError extends Error {
  constructor() {
    super(msg().core.spotify.notAllowlisted);
    this.name = 'NotAllowlistedError';
  }
}

export class QuotaError extends Error {
  constructor(public readonly retryAt: number) {
    super(msg().core.spotify.quotaReached);
    this.name = 'QuotaError';
  }
}
