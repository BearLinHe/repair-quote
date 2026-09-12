import assert from "node:assert/strict";
import test from "node:test";
import { verifyPassword } from "../src/lib/password";

const HASH = "scrypt$156760dd31887621fe30ef9e93b18e52$71061a87f8b88c0b9c66413a79f7de04830eb440eeabc2062716369439048f7f887e36d2c9a29733660b898e3213bdfb961a4285901cbd9d75b1cfa1d282ce70";

test("verifies a matching scrypt password", async () => {
  assert.equal(await verifyPassword("123456", HASH), true);
});

test("rejects a non-matching scrypt password", async () => {
  assert.equal(await verifyPassword("wrong-password", HASH), false);
});
