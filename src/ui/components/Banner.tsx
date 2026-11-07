import type { BannerMessage } from '../../model/banner';
import { Icon } from '../icons';
import { IconButton } from './IconButton';

/**
 * A Material 3 banner (spec 003, FR-041): its icon, the message, and a
 * dismiss button. Still built only from `errorBanner`/`warnBanner`.
 */
export function Banner(p: { message: BannerMessage; onClose: () => void }) {
  const error = p.message.kind === 'error';
  return (
    <div class={error ? 'banner error' : 'banner'} role="alert">
      <Icon name={error ? 'error' : 'warning'} />
      <span class="banner-text">{p.message.text}</span>
      <IconButton icon="close" label="Dismiss" onClick={p.onClose} />
    </div>
  );
}
