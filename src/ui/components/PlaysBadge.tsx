import type { PlaysInfo } from '../../model/aggregate';
import { plural } from '../format';
import { Flag } from './Flag';

export function PlaysBadge(p: { plays: PlaysInfo | null }) {
  if (!p.plays) return null;
  return (
    <Flag kind="plays">
      {plural(p.plays.plays, 'play')}
      {p.plays.source === 'name' ? ' (by artist and title)' : ''}
    </Flag>
  );
}
