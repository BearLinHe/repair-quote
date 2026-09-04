import assert from "node:assert/strict";
import test from "node:test";
import {
  bilingualPdfText,
  containsChinese,
  PdfTranslationError,
  translateChineseForPdf,
} from "../src/lib/pdf-translation";

test("detects Chinese text and renders its matching English translation", () => {
  assert.equal(containsChinese("更换前大灯"), true);
  assert.equal(containsChinese("Replace headlight"), false);
  const translations = new Map([["更换前大灯", "Replace front headlight"]]);
  assert.equal(
    bilingualPdfText("更换前大灯", translations),
    "更换前大灯 / Replace front headlight",
  );
});

test("requires translation configuration before processing Chinese", async () => {
  const previousKey = process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY;
  delete process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY;
  try {
    await assert.rejects(
      () => translateChineseForPdf(["客户公司"]),
      (error: unknown) => error instanceof PdfTranslationError && error.code === "NOT_CONFIGURED",
    );
  } finally {
    if (previousKey) process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY = previousKey;
  }
});
