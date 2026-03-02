/**
 * Returns true if a hex color is perceptually dark.
 * Used to auto-select readable text colors on colored backgrounds.
 */
export function isDark(hex: string): boolean {
  let c = hex.replace('#', '');
  // Handle shorthand hex (e.g., #fff)
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
  // Handle hex with alpha (e.g., #ffffffaa)
  if (c.length === 8) c = c.substring(0, 6);
  if (c.length !== 6) return false;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  // Using perceived luminance formula
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}
