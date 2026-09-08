import { z } from "zod";

export const inventoryImageSchema = z
  .string()
  .max(2_500_000, "图片过大，请重新选择")
  .regex(/^data:image\/(?:jpeg|png|webp);base64,/, "仅支持 JPG、PNG 或 WebP 图片")
  .nullable()
  .optional();
