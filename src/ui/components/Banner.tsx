import type { BannerMessage } from '../../model/banner';

export function Banner(p: { message: BannerMessage; onClose: () => void }) {
  const kind = p.message.kind === 'error' ? 'banner error' : 'banner';
  return (
    <div class={kind} role="alert">
      <span>{p.message.text}</span>
      <button type="button" aria-label="Dismiss" onClick={p.onClose}>
        ×
      </button>
    </div>
  );
}
