export function Banner(p: { message: string; onClose: () => void }) {
  return (
    <div class="banner" role="alert">
      <span>{p.message}</span>
      <button type="button" aria-label="Dismiss" onClick={p.onClose}>
        ×
      </button>
    </div>
  );
}
