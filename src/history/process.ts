import { unzipSync } from 'fflate';
import type { PlayRow } from '../db/schema';
import {
  baseName,
  isAccountDataFile,
  isAccountDataRecord,
  isHistoryFile,
  sortHistoryFiles,
} from './files';
import { PlayAggregator, type ImportCounts, type Outcomes } from './records';

export type ImportMessage =
  | { type: 'progress'; file: string; index: number; total: number }
  | {
      type: 'done';
      plays: PlayRow[];
      counts: ImportCounts;
      outcomes: Outcomes;
      /** IANA zone the month keys were bucketed in. */
      zone: string;
      range: { first: string; last: string } | null;
      processed: string[];
      skipped: { name: string; reason: string }[];
    }
  | {
      type: 'error';
      code: 'account-data-package' | 'no-files' | 'failed';
      message: string;
    };

export const ACCOUNT_DATA_MESSAGE =
  'These files are the "Account data" package, which has no track ids. Request "Extended streaming history" instead: Spotify account, Privacy settings, Download your data.';

interface Source {
  name: string;
  read: () => Promise<Uint8Array>;
}

async function collectSources(
  files: File[]
): Promise<{ sources: Source[]; accountDataSeen: boolean }> {
  const sources: Source[] = [];
  let accountDataSeen = false;
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const names: string[] = [];
      unzipSync(buffer, {
        filter: (entry) => {
          names.push(entry.name);
          return false;
        },
      });
      for (const name of names) {
        if (isAccountDataFile(name)) accountDataSeen = true;
        if (!isHistoryFile(name)) continue;
        sources.push({
          name: baseName(name),
          read: async () =>
            unzipSync(buffer, { filter: (entry) => entry.name === name })[
              name
            ] ?? new Uint8Array(),
        });
      }
    } else {
      if (isAccountDataFile(file.name)) accountDataSeen = true;
      if (!isHistoryFile(file.name)) continue;
      sources.push({
        name: baseName(file.name),
        read: async () => new Uint8Array(await file.arrayBuffer()),
      });
    }
  }
  return { sources: sortHistoryFiles(sources), accountDataSeen };
}

export async function processFiles(
  files: File[],
  post: (message: ImportMessage) => void
): Promise<void> {
  const { sources, accountDataSeen } = await collectSources(files);
  if (sources.length === 0) {
    post(
      accountDataSeen
        ? {
            type: 'error',
            code: 'account-data-package',
            message: ACCOUNT_DATA_MESSAGE,
          }
        : {
            type: 'error',
            code: 'no-files',
            message:
              'No Streaming_History_Audio_*.json files found. Pick my_spotify_data.zip or the JSON files inside it.',
          }
    );
    return;
  }
  const aggregator = new PlayAggregator();
  const processed: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const decoder = new TextDecoder('utf-8');
  for (const [index, source] of sources.entries()) {
    post({
      type: 'progress',
      file: source.name,
      index,
      total: sources.length,
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoder.decode(await source.read()));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      skipped.push({ name: source.name, reason: `unreadable: ${reason}` });
      continue;
    }
    if (!Array.isArray(parsed)) {
      skipped.push({ name: source.name, reason: 'not a JSON array' });
      continue;
    }
    if (parsed.length > 0 && isAccountDataRecord(parsed[0])) {
      post({
        type: 'error',
        code: 'account-data-package',
        message: ACCOUNT_DATA_MESSAGE,
      });
      return;
    }
    for (const record of parsed) aggregator.add(record);
    processed.push(source.name);
  }
  post({
    type: 'done',
    plays: aggregator.rows(),
    counts: aggregator.counts,
    outcomes: aggregator.outcomes(),
    zone: aggregator.zone(),
    range: aggregator.range(),
    processed,
    skipped,
  });
}
