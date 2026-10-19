/** Chromium normalizes fractional trailing zeros in datetime-local.value.
 * Playwright fill compares the assigned string with that normalized value.
 * Keep the exact instant; supply the canonical HTML spelling (no clock rounding).
 */
export function datetimeLocalInput(date: Date): string {
  return date
    .toISOString()
    .slice(0, -1)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "")
    .replace(/:00$/, "");
}
