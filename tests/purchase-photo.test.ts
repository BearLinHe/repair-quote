import test from "node:test";
import assert from "node:assert/strict";
import { getPurchasePhotoSelection, preparePurchasePhoto } from "../src/lib/purchase-photo";

test("drop and picker selection accept a single image without changing the file", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    const file = new File(["image"], "invoice", { type });
    assert.equal(getPurchasePhotoSelection({ 0: file, length: 1 }), file);
  }
});

test("multiple dropped photos must not silently discard all but the first", () => {
  const file = new File(["image"], "invoice.jpg", { type: "image/jpeg" });
  assert.throws(() => getPurchasePhotoSelection([file, file]), /每次只能上传一张/);
  assert.throws(() => getPurchasePhotoSelection([]), /每次只能上传一张/);
});

test("PDF, directory-like, text and empty image selections produce actionable errors", () => {
  for (const file of [new File(["pdf"], "invoice.pdf", { type: "application/pdf" }), new File([], "folder"), new File(["url"], "link.txt", { type: "text/plain" })]) {
    assert.throws(() => getPurchasePhotoSelection([file]), /不支持文件夹或其他文件/);
  }
  assert.throws(() => getPurchasePhotoSelection([new File([], "empty.png", { type: "image/png" })]), /文件为空/);
});

test("40 MB photo limit is shared by drag/drop, picker and photo processing", async () => {
  // Metadata is sufficient here; avoid allocating a 40 MB image for this test.
  const atLimit = { type: "image/jpeg", size: 40 * 1024 * 1024 } as File;
  const oversized = { ...atLimit, size: atLimit.size + 1 } as File;
  assert.equal(getPurchasePhotoSelection([atLimit]), atLimit);
  assert.throws(() => getPurchasePhotoSelection([oversized]), /40 MB/);
  await assert.rejects(preparePurchasePhoto(oversized), /40 MB/);
});
