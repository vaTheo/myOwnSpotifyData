import { lang, LANGS, msg, setLang } from '../../i18n';
import { SegmentedButtons } from '../components/SegmentedButtons';

/**
 * The two languages, each under its own name whatever is shown (spec 031,
 * FR-004). A pick redraws the app at once and is kept on this device; it
 * reads nothing, writes nothing else and restarts no job (FR-011).
 */
export function LanguageSwitch(p: { class?: string }) {
  const names = msg().language.names;
  return (
    <div class={p.class} role="group" aria-label={msg().language.choose}>
      <SegmentedButtons
        options={LANGS.map((value) => ({ value, label: names[value] }))}
        value={lang.value}
        onChange={setLang}
      />
    </div>
  );
}

/** The Settings item "Language" (`#/settings/language`). */
export function LanguageSection() {
  return (
    <div class="settings-language">
      <LanguageSwitch />
      <p class="muted">{msg().language.kept}</p>
    </div>
  );
}
