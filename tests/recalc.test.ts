import assert from "node:assert/strict";
import test from "node:test";
import { calculateTotals } from "../src/lib/recalc";

const defaults = {
  parts_subtotal_cents: 10_000,
  labor_subtotal_cents: 20_000,
  cleaning_rate_bps: 1_000,
  cleaning_cap_cents: 20_000,
  tax_rate_bps: 1_075,
  apply_cleaning: true,
  apply_tax: true,
};

test("uses the default 10.75% tax rate after cleaning fee", () => {
  assert.deepEqual(calculateTotals(defaults), {
    cleaning_fee_cents: 3_000,
    tax_cents: 3_548,
    grand_total_cents: 36_548,
  });
});

test("caps the cleaning fee at $200", () => {
  const result = calculateTotals({
    ...defaults,
    parts_subtotal_cents: 150_000,
    labor_subtotal_cents: 100_000,
  });
  assert.equal(result.cleaning_fee_cents, 20_000);
});

test("can disable cleaning and tax independently", () => {
  assert.deepEqual(
    calculateTotals({ ...defaults, apply_cleaning: false, apply_tax: false }),
    {
      cleaning_fee_cents: 0,
      tax_cents: 0,
      grand_total_cents: 30_000,
    },
  );
});
