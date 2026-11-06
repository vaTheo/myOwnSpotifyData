/**
 * A missing value (spec 003, FR-021): a dash on screen, "no data" to a
 * screen reader, and never a 0.
 */
export function NoData() {
  return (
    <span class="no-data">
      <span aria-hidden="true">—</span>
      <span class="visually-hidden">no data</span>
    </span>
  );
}
