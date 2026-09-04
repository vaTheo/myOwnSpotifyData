export function Filter(p: {
  value: string;
  onInput: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      class="filter"
      type="search"
      placeholder={p.placeholder}
      value={p.value}
      onInput={(e) => p.onInput((e.currentTarget as HTMLInputElement).value)}
    />
  );
}
