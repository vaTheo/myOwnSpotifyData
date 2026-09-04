import type { PlaysInfo } from '../../model/aggregate';
import { plural } from '../format';
import { Badge } from './Badge';

export function PlaysBadge(p: { plays: PlaysInfo | null }) {
  if (!p.plays) return null;
  return (
    <Badge kind="plays">
      {plural(p.plays.plays, 'play')}
      {p.plays.source === 'name' ? ' (by name)' : ''}
    </Badge>
  );
}
