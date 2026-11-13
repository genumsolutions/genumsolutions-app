// =====================================================================
// pilotCostTotal — the illustrative pilot total shown on Home and Services.
//
// 2026-11-13: both screens printed a typed "NPR 8,40,000" next to rows that
// come from the admin-editable pilot_cost_lines table, so an edit could not
// move the headline. The website had the same defect and now sums its rows;
// this module is the app's copy of that rule.
//
// The total is only published while EVERY cost is a plain "NPR n,nnn"
// amount. A row like "NPR 1,00,000 + tax" would otherwise be added as if the
// surcharge were free, so the screens fall back to "Priced per proposal".
// =====================================================================

/** en-IN grouping (last three digits, then pairs): 840000 → "8,40,000".
 *  Hermes does not ship full Intl data on every Android build the app
 *  supports, so this cannot rely on toLocaleString("en-IN"). */
export function formatNpr(value: number): string {
  const digits = String(Math.round(value));
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`;
}

/** Sum `[item, cost, note]` rows, or null when any row is not a plain NPR
 *  amount. Null is rendered as "Priced per proposal". */
export function pilotTotalLabel(
  rows: readonly (readonly string[])[],
): string | null {
  if (rows.length === 0) return null;
  const amounts = rows.map((row) => {
    const cost = String(row[1] ?? "").trim();
    return /^NPR [\d,]+$/.test(cost) ? Number(cost.replace(/[^\d]/g, "")) : NaN;
  });
  if (!amounts.every((amount) => Number.isFinite(amount) && amount > 0)) {
    return null;
  }
  return formatNpr(amounts.reduce((sum, amount) => sum + amount, 0));
}
