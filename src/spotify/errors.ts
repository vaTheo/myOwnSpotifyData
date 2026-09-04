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
    super(
      "This Spotify account is not in the app's user list. Add it in the Spotify developer dashboard under User Management."
    );
    this.name = 'NotAllowlistedError';
  }
}

export class QuotaError extends Error {
  constructor(public readonly retryAt: number) {
    super('Spotify quota reached');
    this.name = 'QuotaError';
  }
}
