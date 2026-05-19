/**
 * Pick evenly-spaced bucket indices for X-axis labels.
 *
 * Distributes `target` indices uniformly between `0` and `n-1` via
 * `Math.round(i * (n-1) / (desired-1))`. The caller derives `target`
 * from the available plot width / label slot width so adjacent labels
 * never overlap on narrow charts.
 *
 * For 3–4 ticks a 1-bucket gap difference is glaringly off-centre
 * (e.g. `n=6, target=3` would place the middle label at 60 % of the
 * chart, not 50 %). We require `(n-1)` to divide evenly by
 * `(desired-1)` for those targets — otherwise step down to the next
 * smaller target. Five or more ticks tolerate the rounding wobble
 * because it spreads out across many gaps.
 */
export function pickTickIndices(n: number, target: number): number[] {
  if (n <= 1) return n === 1 ? [0] : [];
  let desired = Math.max(2, Math.min(target, n));
  if (desired === 4 && (n - 1) % 3 !== 0) desired = 3;
  if (desired === 3 && (n - 1) % 2 !== 0) desired = 2;
  return Array.from({ length: desired }, (_, i) =>
    Math.round((i * (n - 1)) / (desired - 1)),
  );
}
