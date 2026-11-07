/**
 * Remembers a function's last answer while its inputs stay the same (by
 * identity). Screens build their table columns and rows through it, so
 * `DataTable`'s memos hold across renders that change nothing they read
 * (S13 A5); unlike a hook it is safe after a screen's early return.
 */
export function lastCall<A extends unknown[], R>(
  fn: (...args: A) => R
): (...args: A) => R {
  let last: { args: A; value: R } | null = null;
  return (...args: A): R => {
    if (
      last !== null &&
      last.args.length === args.length &&
      last.args.every((a, i) => Object.is(a, args[i]))
    ) {
      return last.value;
    }
    const value = fn(...args);
    last = { args, value };
    return value;
  };
}
