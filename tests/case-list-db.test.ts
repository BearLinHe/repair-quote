import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { caseListSelect, caseListWhere } from "../src/lib/case-list-query";

// Explicit opt-in. Test-only cases and repair items are always rolled back.
test("repair-item search supports substrings, Chinese, owner isolation and ordered list data", { skip: process.env.CASE_LIST_DB_TEST !== "1" }, async () => {
  const db = new PrismaClient();
  const ownerId = `test-case-list-${randomUUID()}`;
  const otherOwner = `${ownerId}-other`;
  const rollback = new Error("ROLLBACK_CASE_LIST_TEST");
  try {
    await assert.rejects(db.$transaction(async (tx) => {
      const main = await tx.case.create({ data: {
        clerk_user_id: ownerId, invoice_number: randomUUID(), plate: "Plate-Alpha", vin: "VIN-Alpha", unit_number: "Unit-Alpha",
        repair_items: { create: [
          { name: "Tire Sales", sort_order: 2 },
          { name: "Brake inspection", sort_order: 1 },
          { name: "轮胎更换", sort_order: 3 },
        ] },
      } });
      const empty = await tx.case.create({ data: { clerk_user_id: ownerId, invoice_number: randomUUID() } });
      const other = await tx.case.create({ data: {
        clerk_user_id: otherOwner, invoice_number: randomUUID(), repair_items: { create: { name: "Tire Sales" } },
      } });
      const fixtures = [main.id, empty.id, other.id];
      const find = (scope: { clerk_user_id?: string }, query?: string) => tx.case.findMany({
        where: { AND: [caseListWhere(scope, query), { id: { in: fixtures } }] },
        select: caseListSelect,
      });
      const scope = { clerk_user_id: ownerId };
      for (const query of ["  tIrE  ", "sales", "轮胎", "更换", "inspection", "plate-alpha", "vin-alpha", "unit-alpha", main.invoice_number]) {
        const rows = await find(scope, query);
        assert.deepEqual(rows.map((row) => row.id), [main.id]);
        assert.deepEqual(rows[0].repair_items.map((item) => item.name), ["Brake inspection", "Tire Sales", "轮胎更换"]);
      }
      assert.deepEqual(await find(scope, "NoMatchingProject"), []);
      const all = await find(scope);
      assert.equal(all.length, 2);
      assert.deepEqual(all.find((row) => row.id === empty.id)?.repair_items, []);
      assert.deepEqual(new Set((await find({}, "TIRE")).map((row) => row.id)), new Set([main.id, other.id]));
      throw rollback;
    }, { timeout: 30000 }), (error) => error === rollback);
    assert.equal(await db.case.count({ where: { clerk_user_id: { in: [ownerId, otherOwner] } } }), 0);
  } finally {
    await db.$disconnect();
  }
});
