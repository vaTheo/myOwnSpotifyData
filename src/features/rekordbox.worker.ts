import { parseRekordbox, type RekordboxMessage } from './rekordbox';

self.onmessage = (event: MessageEvent<{ file: File }>) => {
  const post = (message: RekordboxMessage) => self.postMessage(message);
  event.data.file
    .text()
    .then((text) => {
      post({ type: 'parsed', tracks: parseRekordbox(text) });
    })
    .catch((err: unknown) => {
      post({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    });
};
