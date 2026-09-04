import { auth } from '../auth/browser';

export function Connect() {
  const error = auth.lastAuthError.value;
  return (
    <div class="connect">
      <h1>DJ Data</h1>
      <p>
        Your most played tracks, your playlists ranked by plays, and the artists
        you have saved the most. Reads your top lists and the playlists you own.
        Nothing leaves this browser.
      </p>
      {error && <p class="error">{error}</p>}
      <button
        type="button"
        class="primary"
        onClick={() => void auth.beginLogin()}
      >
        Connect Spotify
      </button>
    </div>
  );
}
