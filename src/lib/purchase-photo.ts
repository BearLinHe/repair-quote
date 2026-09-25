"use client";

import { IMPORT_IMAGE_LIMIT } from "./purchase-import";

// Preserve substantially more text detail than small SKU thumbnails.
export async function preparePurchasePhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("第一版支持单页图片，请选择 JPG、PNG 或 WebP；PDF 请先转为图片");
  if (file.size > 40 * 1024 * 1024) throw new Error("照片原图不能超过 40 MB");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("无法读取图片，请改用 JPG/PNG，或重新拍照"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法处理图片");
    for (const [dimension, quality] of [[2800, 0.9], [2800, 0.8], [2400, 0.8], [2000, 0.75]] as const) {
      const scale = Math.min(1, dimension / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const encoded = canvas.toDataURL("image/jpeg", quality);
      if (encoded.length <= IMPORT_IMAGE_LIMIT) return encoded;
    }
    throw new Error("图片仍然过大，请裁掉单据周围无关区域再试");
  } finally { URL.revokeObjectURL(url); }
}
