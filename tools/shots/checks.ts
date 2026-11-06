/**
 * The layout checks of the visual loop (research D19, checks 1–6), run
 * inside the page with `page.evaluate(layoutChecks)`. The function must stay
 * self-contained: Playwright serialises its source, so it cannot use imports
 * or anything outside its own body.
 *
 * Focus (7), axe (8), console and network (9) are checked by the runner.
 */
export interface Finding {
  check: string;
  selector: string;
  detail: string;
}

export function layoutChecks(): Finding[] {
  const findings: Finding[] = [];
  const MIN_TARGET = 48;

  function describe(el: Element): string {
    const parts: string[] = [];
    let node: Element | null = el;
    for (let depth = 0; node && depth < 4; depth += 1) {
      let part = node.tagName.toLowerCase();
      const role = node.getAttribute('role');
      if (node.id) part += `#${node.id}`;
      else if (role) part += `[role=${role}]`;
      else if (node.classList.length > 0)
        part += `.${[...node.classList].join('.')}`;
      parts.unshift(part);
      node = node.parentElement;
    }
    const text = (el.textContent ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);
    return `${parts.join(' > ')}${text ? ` "${text}"` : ''}`;
  }

  function visible(el: Element): boolean {
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /** Inside a fixed or sticky container: it moves with the viewport. */
  function pinned(el: Element): boolean {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') return true;
    }
    return false;
  }

  // 1. No sideways page scroll.
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) {
    findings.push({
      check: 'page-scroll',
      selector: 'html',
      detail: `page is ${doc.scrollWidth}px wide in a ${doc.clientWidth}px viewport`,
    });
  }

  // 2. No clipped text: content wider than its box that neither scrolls nor
  //    ends with an ellipsis.
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue;
    if (
      ['svg', 'path', 'input', 'textarea', 'select', 'iframe', 'img'].includes(
        el.tagName.toLowerCase()
      )
    )
      continue;
    const ownText = [...el.childNodes].some(
      (n) =>
        n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== ''
    );
    if (!ownText) continue;
    // Screen-reader-only text is clipped to 1 px on purpose.
    if (el.closest('.visually-hidden')) continue;
    const style = getComputedStyle(el);
    if (style.display === 'inline') continue;
    if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    if (style.textOverflow === 'ellipsis') continue;
    findings.push({
      check: 'clipped-text',
      selector: describe(el),
      detail: `content ${el.scrollWidth}px in a ${el.clientWidth}px box, no ellipsis`,
    });
  }

  // 3. No overlap between interactive elements that are not nested.
  const interactive = [
    ...document.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, summary, [role=button], [role=tab], [tabindex]:not([tabindex="-1"])'
    ),
  ].filter((el) => visible(el) && !pinned(el));
  const boxes = interactive
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .sort((a, b) => a.r.top - b.r.top);
  for (let i = 0; i < boxes.length; i += 1) {
    const a = boxes[i];
    for (
      let j = i + 1;
      j < boxes.length && boxes[j].r.top < a.r.bottom;
      j += 1
    ) {
      const b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 2 && h > 2) {
        findings.push({
          check: 'overlap',
          selector: `${describe(a.el)} × ${describe(b.el)}`,
          detail: `${Math.round(w)}×${Math.round(h)}px shared`,
        });
      }
    }
  }

  // 4. Table columns line up: cells marked data-align="end" share their right
  //    edge, every other cell its left edge, within 1 px. The tables are ARIA
  //    grids; only cells with a `data-align` are columns (a phone's item and
  //    a heading row spanning the table have none).
  for (const table of document.querySelectorAll('[role=grid], [role=table]')) {
    const columns = new Map<
      number,
      { edge: number; el: Element; end: boolean }[]
    >();
    for (const row of table.querySelectorAll('[role=row]')) {
      const cells = [
        ...row.querySelectorAll(
          ':scope > [role=gridcell], :scope > [role=cell], :scope > [role=columnheader]'
        ),
      ];
      cells.forEach((cell, index) => {
        if (!cell.hasAttribute('data-align') || !visible(cell)) return;
        const r = cell.getBoundingClientRect();
        const end = cell.getAttribute('data-align') === 'end';
        const list = columns.get(index) ?? [];
        list.push({ edge: end ? r.right : r.left, el: cell, end });
        columns.set(index, list);
      });
    }
    for (const [index, cells] of columns) {
      const first = cells[0];
      const off = cells.find((c) => Math.abs(c.edge - first.edge) > 1);
      if (off) {
        findings.push({
          check: 'column-alignment',
          selector: describe(off.el),
          detail: `column ${index + 1} ${first.end ? 'right' : 'left'} edge ${Math.round(off.edge)}px, header row ${Math.round(first.edge)}px`,
        });
      }
    }
  }

  // 5. Targets of at least 48 × 48, except links inside a line of text.
  for (const el of interactive) {
    const style = getComputedStyle(el);
    const inlineLink =
      el.tagName === 'A' &&
      style.display === 'inline' &&
      (el.parentElement?.textContent ?? '').trim().length >
        (el.textContent ?? '').trim().length;
    if (inlineLink) continue;
    const r = el.getBoundingClientRect();
    if (r.width < MIN_TARGET - 0.5 || r.height < MIN_TARGET - 0.5) {
      findings.push({
        check: 'target-size',
        selector: describe(el),
        detail: `${Math.round(r.width)}×${Math.round(r.height)}px`,
      });
    }
  }

  // 6. The navigation and the top bar sit inside the viewport.
  for (const el of document.querySelectorAll(
    'nav, body > * header, [role=banner]'
  )) {
    if (!visible(el) || el.closest('main')) continue;
    const r = el.getBoundingClientRect();
    if (
      r.left < -1 ||
      r.right > innerWidth + 1 ||
      r.top < -1 ||
      r.top > innerHeight
    ) {
      findings.push({
        check: 'frame-in-viewport',
        selector: describe(el),
        detail: `at ${Math.round(r.left)},${Math.round(r.top)} size ${Math.round(r.width)}×${Math.round(r.height)} in ${innerWidth}×${innerHeight}`,
      });
    }
  }

  return findings;
}
