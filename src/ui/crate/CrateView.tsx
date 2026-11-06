import { crateStatus } from '../../model/state';
import type { CrateView as CrateViewName } from '../../router';
import { ByYear } from './ByYear';
import { Classics } from './Classics';
import { CrateEmpty } from './CrateEmpty';
import { Finish } from './Finish';
import { Gems } from './Gems';
import { Rotation } from './Rotation';
import { CrateShell } from './shared';

function Body({
  view,
  period,
  detail,
}: {
  view: CrateViewName;
  period?: string;
  detail?: string;
}) {
  switch (view) {
    case 'rotation':
      return <Rotation detail={detail} />;
    case 'gems':
      return <Gems detail={detail} />;
    case 'classics':
      return <Classics detail={detail} />;
    case 'year':
      return <ByYear period={period} detail={detail} />;
    case 'finish':
      return <Finish detail={detail} />;
  }
}

/** `detail` is the play row whose details sheet is open (`?d=`). */
export function CrateView({
  view,
  period,
  detail,
}: {
  view: CrateViewName;
  period?: string;
  detail?: string;
}) {
  return (
    <CrateShell>
      {crateStatus.value === 'ready' ? (
        <Body view={view} period={period} detail={detail} />
      ) : (
        <CrateEmpty
          status={crateStatus.value === 'reimport' ? 'reimport' : 'empty'}
        />
      )}
    </CrateShell>
  );
}
