import assert from "node:assert/strict";
import test from "node:test";
import { caseListSelect, caseListWhere } from "../src/lib/case-list-query";

test("case list searches saved repair items alongside invoice and vehicle fields", () => {
  const match = { contains: "Tire", mode: "insensitive" };
  assert.deepEqual(caseListWhere({ clerk_user_id: "owner-a" }, "  Tire  "), {
    clerk_user_id: "owner-a",
    OR: [
      { plate: match }, { vin: match }, { unit_number: match }, { invoice_number: match },
      { repair_items: { some: { name: match } } },
    ],
  });
});

test("blank queries preserve ownership scope; administrator queries stay unscoped", () => {
  const scope = { clerk_user_id: "owner-a" };
  for (const query of [undefined, "", "   "]) {
    assert.deepEqual(caseListWhere(scope, query), scope);
    assert.deepEqual(caseListWhere({}, query), {});
  }
  assert.equal(caseListWhere({}, "轮胎").clerk_user_id, undefined);
  assert.equal(caseListWhere(scope, "轮胎").clerk_user_id, "owner-a");
  assert.deepEqual(scope, { clerk_user_id: "owner-a" });
});

test("list returns only project IDs/names in detail-page order, without limiting searchable items", () => {
  assert.deepEqual(caseListSelect.repair_items, {
    select: { id: true, name: true },
    orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
  });
});
