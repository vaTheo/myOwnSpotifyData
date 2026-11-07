/**
 * One item of the list pane beside a detail (`ListPane`): cover, name and
 * one figure, a link to the item, the open one `aria-current="page"`.
 */
export function TrackRow(p: {
  imageUrl?: string | null;
  title: string;
  subtitle?: string;
  href: string;
  /** Where focus returns when the row's details sheet closes. */
  rowId?: string;
  /** The row whose details sheet is open. */
  selected?: boolean;
  /** -1 leaves the row out of the Tab order (a roving list, T100). */
  tabIndex?: number;
}) {
  return (
    <li>
      <div class={p.selected ? 'row selected' : 'row'}>
        {/* `null`: a cover column without a picture keeps its place. */}
        {p.imageUrl ? (
          <img class="cover" src={p.imageUrl} loading="lazy" alt="" />
        ) : (
          p.imageUrl === null && <span class="cover" aria-hidden="true" />
        )}
        <a
          class="main"
          href={p.href}
          data-row-id={p.rowId}
          aria-current={p.selected ? 'page' : undefined}
          tabIndex={p.tabIndex}
        >
          <span class="title">{p.title}</span>
          {p.subtitle && <span class="sub">{p.subtitle}</span>}
        </a>
        <span class="chev" aria-hidden="true">
          ›
        </span>
      </div>
    </li>
  );
}
