export function Segmented<T extends string>(p: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  scroll?: boolean;
}) {
  return (
    <div class={p.scroll ? 'segmented scroll' : 'segmented'} role="tablist">
      {p.options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="tab"
          aria-selected={o.value === p.value}
          class={o.value === p.value ? 'active' : ''}
          onClick={() => p.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
