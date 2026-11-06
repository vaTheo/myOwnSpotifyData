import type { ComponentChildren } from 'preact';
import type { BannerMessage } from '../../model/banner';
import { model } from '../../model/state';
import type { Route } from '../../router';
import { ActivityButton } from '../ActivityButton';
import { Banner } from '../components/Banner';
import { ProgressBar } from '../components/ProgressBar';
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
  return (
    <div class="frame">
      <Nav current={p.route} />
      <div class="frame-body">
        <TopBar title={title} up={up}>
          <ActivityButton />
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
    </div>
  );
}
