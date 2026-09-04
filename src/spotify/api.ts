import { auth } from '../auth/browser';
import { createClient } from './client';

export const api = createClient({
  fetchFn: (input, init) => fetch(input, init),
  getAccessToken: (force) => auth.getAccessToken(force),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
});
