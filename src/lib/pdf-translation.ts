const CHINESE_TEXT = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

export class PdfTranslationError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_CONFIGURED" | "REQUEST_FAILED" | "INVALID_RESPONSE",
  ) {
    super(message);
    this.name = "PdfTranslationError";
  }
}

export function containsChinese(value: string | null | undefined): boolean {
  return CHINESE_TEXT.test(value ?? "");
}

function decodeTranslationText(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export async function translateChineseForPdf(values: Array<string | null | undefined>) {
  const sourceTexts = [...new Set(values.map((value) => value?.trim() ?? "").filter(containsChinese))];
  const translations = new Map<string, string>();
  if (sourceTexts.length === 0) return translations;

  const apiKey = process.env.GOOGLE_CLOUD_TRANSLATE_API_KEY?.trim();
  if (!apiKey) {
    throw new PdfTranslationError(
      "PDF 中包含中文，请先配置 Google Cloud Translation API 密钥",
      "NOT_CONFIGURED",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    // Cloud Translation Basic accepts at most 128 q values per request.
    for (let offset = 0; offset < sourceTexts.length; offset += 128) {
      const batch = sourceTexts.slice(offset, offset + 128);
      const response = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: batch, source: "zh-CN", target: "en", format: "text" }),
          signal: controller.signal,
          cache: "no-store",
        },
      );
      if (!response.ok) {
        throw new PdfTranslationError("中文翻译服务请求失败", "REQUEST_FAILED");
      }
      const payload = (await response.json()) as {
        data?: { translations?: Array<{ translatedText?: string }> };
      };
      const results = payload.data?.translations;
      if (!results || results.length !== batch.length) {
        throw new PdfTranslationError("中文翻译服务返回的数据不完整", "INVALID_RESPONSE");
      }
      batch.forEach((source, index) => {
        const translatedValue = results[index]?.translatedText?.trim();
        const translated = translatedValue ? decodeTranslationText(translatedValue) : "";
        if (!translated || !/[A-Za-z]/.test(translated)) {
          throw new PdfTranslationError(`无法为“${source}”生成英文翻译`, "INVALID_RESPONSE");
        }
        translations.set(source, translated);
      });
    }
    return translations;
  } catch (error) {
    if (error instanceof PdfTranslationError) throw error;
    throw new PdfTranslationError("中文翻译服务暂时不可用", "REQUEST_FAILED");
  } finally {
    clearTimeout(timeout);
  }
}

export function bilingualPdfText(value: string | null | undefined, translations: Map<string, string>) {
  const source = value?.trim() ?? "";
  if (!containsChinese(source)) return source;
  const translated = translations.get(source);
  if (!translated) {
    throw new PdfTranslationError(`缺少“${source}”的英文翻译`, "INVALID_RESPONSE");
  }
  return `${source} / ${translated}`;
}
