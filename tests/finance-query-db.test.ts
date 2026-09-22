import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { financeInvoiceWhere } from "../src/lib/finance-query";
import { invoicePartUsage } from "../src/lib/invoice-parts";

// Opt-in integration test: isolated fixture owners, with an unconditional rollback.
test("finance filtering, summary, parts and export queries agree without crossing owner or date boundaries", { skip: process.env.FINANCE_DB_TEST !== "1" }, async () => {
  const db = new PrismaClient();
  const owner = `test-finance-${randomUUID()}`;
  const otherOwner = `${owner}-other`;
  const rollback = new Error("ROLLBACK_FINANCE_TEST");
  try {
    await assert.rejects(db.$transaction(async (tx) => {
      const fixtures = [
        { key: "start", at: "2026-09-22T07:00:00Z", method: "Check", company: "ABC Trucking" },
        { key: "end", at: "2026-09-23T06:59:59.999Z", method: "check", company: "ABC Trucking" },
        { key: "before", at: "2026-09-22T06:59:59.999Z", method: "Check", company: "ABC Trucking" },
        { key: "after", at: "2026-09-23T07:00:00Z", method: "Check", company: "ABC Trucking" },
        { key: "cash", at: "2026-09-22T12:00:00Z", method: "Cash", company: "ABC Trucking" },
        { key: "company", at: "2026-09-22T12:00:00Z", method: "Check", company: "Other Company" },
        { key: "null", at: "2026-09-22T12:00:00Z", method: null, company: "ABC Trucking" },
        { key: "empty", at: "2026-09-22T12:00:00Z", method: "", company: "ABC Trucking" },
        { key: "owner", at: "2026-09-22T12:00:00Z", method: "Check", company: "ABC Trucking" },
      ];
      const ids = new Map<string, string>();
      for (const fixture of fixtures) {
        const ownerId = fixture.key === "owner" ? otherOwner : owner;
        const invoiceNumber = randomUUID();
        const record = await tx.case.create({ data: {
          clerk_user_id: ownerId, invoice_number: invoiceNumber, bill_to_company: fixture.company, payment_method: fixture.method,
          parts: { create: { name: "Fallback tire", qty: 4, unit_price_cents: 100, line_total_cents: 400 } },
          labor: { create: { name: "Labor", hours: 1.5, rate_cents: 100, line_total_cents: 150 } },
          invoice: { create: {
            clerk_user_id: ownerId, invoice_number: invoiceNumber, issued_at: new Date(fixture.at),
            parts_revenue_cents: 400, labor_revenue_cents: 150, cleaning_fee_cents: 0, tax_cents: 0, grand_total_cents: 550,
            snapshot: fixture.key === "start" ? { parts: [{ name: "Saved tire", qty: 2 }] } : {},
          } },
        }, include: { invoice: true } });
        ids.set(fixture.key, record.invoice!.id);
      }
      const filters = { start: "2026-09-22", end: "2026-09-22", bill_to: "abc", payment_method: "CHECK" };
      const scope = { clerk_user_id: owner };
      const where = financeInvoiceWhere(scope, filters);
      const records = await tx.invoiceRecord.findMany({ where, include: { case: { select: { parts: { select: { name: true, qty: true } } } } } });
      assert.deepEqual(new Set(records.map((row) => row.id)), new Set([ids.get("start"), ids.get("end")]));
      assert.deepEqual(invoicePartUsage(records.find((row) => row.id === ids.get("start"))!.snapshot), [{ name: "Saved tire", qty: 2 }]);
      const legacy = records.find((row) => row.id === ids.get("end"))!;
      assert.deepEqual(invoicePartUsage(legacy.snapshot, legacy.case.parts), [{ name: "Fallback tire", qty: 4 }]);
      const summaryWhere = { ...where, payment_status: { not: "VOID" as const } };
      const summary = await tx.invoiceRecord.aggregate({ where: summaryWhere, _count: true, _sum: { grand_total_cents: true } });
      assert.equal(summary._count, 2);
      assert.equal(summary._sum.grand_total_cents, 1100);
      const hours = await tx.caseLabor.aggregate({ where: { case: { invoice: { is: summaryWhere } } }, _sum: { hours: true } });
      assert.equal(Number(hours._sum.hours), 3);
      const exported = await tx.invoiceRecord.findMany({ where: { ...where, id: { in: [...ids.values()] } } });
      assert.deepEqual(new Set(exported.map((row) => row.id)), new Set(records.map((row) => row.id)));
      const missing = await tx.invoiceRecord.findMany({ where: financeInvoiceWhere(scope, { start: filters.start, end: filters.end, payment_method_missing: "1" }) });
      assert.deepEqual(new Set(missing.map((row) => row.id)), new Set([ids.get("null"), ids.get("empty")]));
      const admin = await tx.invoiceRecord.findMany({ where: { ...financeInvoiceWhere({}, filters), id: { in: [...ids.values()] } } });
      assert.equal(admin.length, 3);
      throw rollback;
    }, { timeout: 60000 }), (error) => error === rollback);
    assert.equal(await db.case.count({ where: { clerk_user_id: { in: [owner, otherOwner] } } }), 0);
  } finally {
    await db.$disconnect();
  }
});
