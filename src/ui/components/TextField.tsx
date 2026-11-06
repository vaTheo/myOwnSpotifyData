import type { JSX } from 'preact';

/**
 * Material 3 outlined text field (spec 003). The label, when given, is a
 * real `<label>`; otherwise the placeholder must say what goes in, and an
 * `aria-label` names the field.
 */
export function TextField(
  p: {
    label?: string;
    onValue: (value: string) => void;
  } & Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'label'>
) {
  const { label, onValue, class: extra, ...rest } = p;
  const input = (
    <input
      {...rest}
      class={extra ? `text-field ${extra}` : 'text-field'}
      aria-label={label ? undefined : (p['aria-label'] ?? p.placeholder)}
      onInput={(e) => onValue((e.currentTarget as HTMLInputElement).value)}
    />
  );
  if (!label) return input;
  return (
    <label class="text-field-label">
      <span>{label}</span>
      {input}
    </label>
  );
}
