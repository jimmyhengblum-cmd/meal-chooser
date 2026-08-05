// Summed fractional quantities (e.g. 1/3 cup + 1/3 cup) produce long
// floating-point tails; round to a sane display precision.
export function formatQuantity(quantity: number): string {
  return (Math.round(quantity * 100) / 100).toString();
}
