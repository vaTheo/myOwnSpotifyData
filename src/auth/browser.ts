import { CLIENT_ID, redirectUri } from '../env';
import { createSessionStore } from './session';

export const auth = createSessionStore({
  storage: localStorage,
  fetchFn: (input, init) => fetch(input, init),
  now: () => Date.now(),
  navigate: (url) => location.assign(url),
  clientId: CLIENT_ID,
  redirectUri,
});
