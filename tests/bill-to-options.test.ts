import assert from "node:assert/strict";
import test from "node:test";
import { billToSearchKey, searchBillToCompanies, uniqueBillToCompanies } from "../src/lib/bill-to-options";

test("Bill To history excludes empty names and deduplicates without losing the saved spelling", () => {
  const companies = uniqueBillToCompanies([null, "", "  ", "YG Trucking LLC", " yg   trucking llc ", "ABC Inc", "ABC INC"]);
  assert.deepEqual(companies, ["ABC Inc", "YG Trucking LLC"]);
});

test("Bill To search supports partial names, mixed case, multiple words and Chinese", () => {
  const companies = ["YG Trucking LLC", "Friendly Tire Service", "ABC Inc", "远洋运输公司"];
  assert.deepEqual(searchBillToCompanies(companies, "TRUCK ll"), ["YG Trucking LLC"]);
  assert.deepEqual(searchBillToCompanies(companies, "  tire   fri "), ["Friendly Tire Service"]);
  assert.deepEqual(searchBillToCompanies(companies, "运输"), ["远洋运输公司"]);
  assert.deepEqual(searchBillToCompanies(companies, "new company"), []);
  assert.deepEqual(searchBillToCompanies(companies, "  "), companies);
});

test("Bill To comparison normalizes full-width characters without changing new-company input", () => {
  assert.equal(billToSearchKey("ＡＢＣ　Inc"), billToSearchKey("abc inc"));
  assert.deepEqual(uniqueBillToCompanies(["ＡＢＣ Inc", "ABC Inc"]), ["ＡＢＣ Inc"]);
});
