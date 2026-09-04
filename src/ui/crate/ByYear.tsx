export function ByYear(p: { period?: string }) {
  return (
    <p class="empty">
      By year arrives in the next task
      {p.period ? ` (${p.period})` : ''}.
    </p>
  );
}
