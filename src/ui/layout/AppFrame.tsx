import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import type { BannerMessage } from '../../model/banner';
import { model } from '../../model/state';
import type { Route } from '../../router';
import { ActivityButton } from '../ActivityButton';
import { PlaylistActions } from '../Playlist';
import { Banner } from '../components/Banner';
import { ProgressBar } from '../components/ProgressBar';
import { TrackSheet } from '../details/TrackDetails';
import { frameDetail } from '../search/choose';
import {
  installSearchKeys,
  openSearch,
  searchOpen,
  SearchView,
} from '../search/SearchView';
import { Nav } from './Nav';
import { ScreenTabs } from './ScreenTabs';
import { TopBar } from './TopBar';
import { screenTitle } from './titles';

/**
 * The web-first frame (spec 003, US1): the navigation, then a column with
 * the top bar, the tabs of a tab root, the banner and the screen. Landmarks:
 * `nav`, `header` (the top bar) and `main` (FR-044). While the library
 * loads, the frame is already there and the screen says so (FR-028).
 */
export function AppFrame(p: {
  route: Route;
  loading: boolean;
  banner: BannerMessage | null;
  onCloseBanner: () => void;
  children: ComponentChildren;
}) {
  const { title, up } = screenTitle(p.route, model.value);
  useEffect(installSearchKeys, []);
  const detail = p.loading ? null : frameDetail(p.route);
  return (
    <div class="frame">
      <Nav current={p.route} />
      <div class="frame-body">
        <TopBar title={title} up={up} onSearch={openSearch}>
          <ActivityButton />
          {p.route.name === 'playlist' && !p.loading && (
            <PlaylistActions id={p.route.id} />
          )}
        </TopBar>
        <ScreenTabs current={p.route} />
        {p.banner && <Banner message={p.banner} onClose={p.onCloseBanner} />}
        <main class="screen">
          {p.loading ? (
            <div class="screen-loading">
              <ProgressBar label="Loading your library…" done={0} total={0} />
            </div>
          ) : (
            p.children
          )}
        </main>
      </div>
      {detail && <TrackSheet trackRef={{ trackId: detail }} rowId={detail} />}
      {searchOpen.value && <SearchView />}
    </div>
  );
}
