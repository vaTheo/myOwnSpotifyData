import { crateStatus } from '../../model/state';
import type { CrateView as CrateViewName } from '../../router';
import { ByYear } from './ByYear';
import { Classics } from './Classics';
import { CrateEmpty } from './CrateEmpty';
import { Finish } from './Finish';
import { Gems } from './Gems';
import { Rotation } from './Rotation';
import { CrateShell } from './shared';

const TITLE: Record<CrateViewName, string> = {
  rotation: 'Heavy rotation',
  gems: 'Forgotten gems',
  classics: 'All-time classics',
  year: 'By year',
  finish: 'Finish rate',
};

function Body({ view, period }: { view: CrateViewName; period?: string }) {
  switch (view) {
    case 'rotation':
      return <Rotation />;
    case 'gems':
      return <Gems />;
    case 'classics':
      return <Classics />;
    case 'year':
      return <ByYear period={period} />;
    case 'finish':
      return <Finish />;
  }
}

export function CrateView({
  view,
  period,
}: {
  view: CrateViewName;
  period?: string;
}) {
  return (
    <CrateShell title={TITLE[view]}>
      {crateStatus.value === 'ready' ? (
        <Body view={view} period={period} />
      ) : (
        <CrateEmpty
          status={crateStatus.value === 'reimport' ? 'reimport' : 'empty'}
        />
      )}
    </CrateShell>
  );
}
