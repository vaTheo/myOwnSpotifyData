import { signal } from '@preact/signals';
import type { YearPeriod } from '../../model/crate';

// Module level, so a tab switch keeps each view's setting and a reload
// resets it (design §4). The hub reads them to label and count its rows.
export const rotationMonths = signal<number>(3);
export const gemMonths = signal<number>(12);
export const classicSort = signal<'years' | 'plays'>('years');
/** null: the latest year with plays. */
export const yearSel = signal<number | null>(null);
export const yearPeriod = signal<YearPeriod>('all');
export const finishTab = signal<'finished' | 'skipped'>('finished');
