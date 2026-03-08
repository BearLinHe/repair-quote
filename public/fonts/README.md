# PDF 中文字体

生成 PDF 时优先使用此目录下的 **NotoSansCJKsc-Regular.otf**（官方 Noto Sans CJK 简体中文），中文即可正常显示。

**首次或部署后若 PDF 仍出现中文为 `?`：**

在项目根目录执行一次：

```bash
node scripts/download-pdf-font.mjs
```

会将 Noto Sans CJK SC (OTF, ~16MB) 下载到此目录。部署时请将 `public/fonts/NotoSansCJKsc-Regular.otf` 一并提交，或在 build 中运行上述脚本。
