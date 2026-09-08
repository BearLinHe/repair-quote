import assert from "node:assert/strict";
import test from "node:test";
import {
  canEditCaseDetails,
  canTransitionCase,
  ownsCase,
} from "../src/lib/case-rules";

test("allows only configured case status transitions", () => {
  assert.equal(canTransitionCase("SUBMITTED", "IN_PROGRESS"), true);
  assert.equal(canTransitionCase("IN_PROGRESS", "COMPLETED"), true);
  assert.equal(canTransitionCase("COMPLETED", "IN_PROGRESS"), false);
  assert.equal(canTransitionCase("CANCELED", "SUBMITTED"), false);
});

test("allows detail edits while a case is in progress or completed", () => {
  assert.equal(canEditCaseDetails("IN_PROGRESS"), true);
  assert.equal(canEditCaseDetails("SUBMITTED"), false);
  assert.equal(canEditCaseDetails("COMPLETED"), true);
  assert.equal(canEditCaseDetails("CANCELED"), false);
});

test("isolates cases by owner user id", () => {
  assert.equal(ownsCase("user-a", "user-a"), true);
  assert.equal(ownsCase("user-a", "user-b"), false);
});
