#!/usr/bin/env node
/**
 * 将官方 Noto Sans CJK SC (OTF) 下载到 public/fonts/，生成 PDF 时即可正常显示中文。
 * 运行一次即可：node scripts/download-pdf-font.mjs
 * 约 16MB，首次下载可能较慢。
 */
import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "fonts");
const outFile = join(outDir, "NotoSansCJKsc-Regular.otf");
const url = "https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf";

console.log("Downloading Noto Sans CJK SC (OTF, ~16MB)...");
const res = await fetch(url);
if (!res.ok) {
  console.error("Download failed:", res.status, res.statusText);
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
await mkdir(outDir, { recursive: true });
await writeFile(outFile, buf);
console.log("Saved to", outFile);
console.log("PDF 中文显示将使用此字体。");
