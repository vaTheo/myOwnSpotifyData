import { processFiles, type ImportMessage } from './process';

self.onmessage = (event: MessageEvent<{ files: File[] }>) => {
  const post = (message: ImportMessage) => self.postMessage(message);
  processFiles(event.data.files, post).catch((err: unknown) => {
    post({
      type: 'error',
      code: 'failed',
      message: err instanceof Error ? err.message : String(err),
    });
  });
};
