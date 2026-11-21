/** Height of the Cascade skyline (0..1) at horizontal position x (0..1). */

// South to north as seen from Bend: Bachelor, Broken Top, the Three Sisters,
// Mt. Washington, Three Fingered Jack, Mt. Jefferson. The Sisters sit right of
// centre so the tallest peaks rise under the open sky, not under the headline.
const PEAKS: [center: number, height: number, width: number][] = [
  [0.095, 0.46, 0.09],
  [0.265, 0.5, 0.052],
  [0.318, 0.41, 0.034],
  [0.545, 0.96, 0.08],
  [0.658, 0.8, 0.056],
  [0.74, 0.86, 0.06],
  [0.848, 0.4, 0.027],
  [0.905, 0.36, 0.032],
  [0.985, 0.7, 0.07],
];

export function ridge(x: number): number {
  const base = 0.17 + 0.03 * Math.sin(x * 8.4 + 1.1) + 0.018 * Math.sin(x * 21.3 + 0.4);
  let h = base;
  for (const [c, ph, w] of PEAKS) {
    const d = Math.abs(x - c) / w;
    // broad shoulders with a defined summit, like a stratovolcano
    const v = ph * Math.exp(-Math.pow(d, 1.75)) * (1 - 0.06 * Math.min(d, 1));
    if (v > h) h = v + (h - base) * 0.2;
  }
  return h + 0.01 * Math.sin(x * 130) + 0.006 * Math.sin(x * 301 + 2);
}
