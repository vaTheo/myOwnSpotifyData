import {
  AccountMain,
  AccountSection,
  accountDescription,
} from './AccountSection';
import { AudioMain, AudioSection, audioDescription } from './AudioSection';
import { msg } from '../../i18n';
import { DangerZone, dangerText } from './DangerZone';
import {
  HistoryMain,
  HistorySection,
  historyDescription,
} from './HistorySection';
import { LanguageSection } from './LanguageSection';
import { ReachMain, ReachSection, reachDescription } from './ReachSection';
import {
  itemOfRoute,
  itemsOf,
  SETTINGS_GROUPS,
  SETTINGS_ITEMS,
  type SectionId,
} from './sections';
import { ServerMain, ServerSection, serverDescription } from './ServerSection';
import { SettingsItem } from './SettingsItem';
import { SyncMain, SyncSection, syncDescription } from './SyncSection';
import { SyncStatus } from './SyncStatus';
import { useSettingsLines } from './useSettingsLines';
import type { ComponentChildren } from 'preact';

interface Parts {
  main?: ComponentChildren;
  description: ComponentChildren;
  body: ComponentChildren;
  class?: string;
}

/** `act`: the item's main action is the one needed now (filled button). */
function parts(id: SectionId, act: boolean): Parts {
  switch (id) {
    case 'account':
      return {
        main: <AccountMain />,
        description: accountDescription(),
        body: <AccountSection />,
      };
    case 'sync':
      return {
        main: <SyncMain act={act} />,
        description: syncDescription(),
        body: <SyncSection />,
      };
    case 'history':
      return {
        main: <HistoryMain act={act} />,
        description: historyDescription(),
        body: <HistorySection />,
      };
    case 'audio':
      return {
        main: <AudioMain act={act} />,
        description: audioDescription(),
        body: <AudioSection />,
      };
    case 'reach':
      return {
        main: <ReachMain act={act} />,
        description: reachDescription(),
        body: <ReachSection />,
      };
    case 'server':
      return {
        main: <ServerMain act={act} />,
        description: serverDescription(),
        body: <ServerSection />,
      };
    case 'language':
      return {
        description: msg().language.description,
        body: <LanguageSection />,
      };
    case 'danger':
      return {
        description: dangerText(),
        body: <DangerZone />,
        class: 'settings-danger',
      };
  }
}

/**
 * Settings as "Data and sync" (spec 003, US5; spec 026): the Sync status
 * block first, never folded, then the items under their group headings, each
 * closed to one line, then the Danger zone apart and the app version. Every
 * long job starts from here or from the automatic chain (ADR-12).
 */
export function SettingsPage(p: { item?: string }) {
  const lines = useSettingsLines();
  // `#/settings/<item>`: the item a link names lands opened (spec 026).
  const linked = itemOfRoute(p.item);
  const item = (id: SectionId) => {
    const part = parts(id, lines.items[id].act === true);
    const def = SETTINGS_ITEMS.find((s) => s.id === id);
    const name = def?.label ?? id;
    return (
      <SettingsItem
        key={id}
        id={id}
        name={name}
        line={lines.items[id]}
        main={part.main}
        description={part.description}
        linked={linked === id}
        // The item set apart heads its own part of the outline.
        level={def?.group === null ? 2 : 3}
        class={part.class}
      >
        {part.body}
      </SettingsItem>
    );
  };
  return (
    <div class="settings">
      <SyncStatus rows={lines.rows} />
      {SETTINGS_GROUPS.map((g) => (
        <section
          key={g.id}
          class="settings-group"
          aria-labelledby={`settings-group-${g.id}`}
        >
          <h2 id={`settings-group-${g.id}`} class="settings-group-title">
            {g.label}
          </h2>
          {itemsOf(g.id).map(item)}
        </section>
      ))}
      <div class="settings-apart">{itemsOf(null).map(item)}</div>
      <p class="muted settings-version">
        {msg().settings.page.version(__APP_VERSION__)}
      </p>
    </div>
  );
}
