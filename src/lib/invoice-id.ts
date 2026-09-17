import { z } from "zod";

const uuidSchema = z.string().uuid();

// Imported invoices use 32-character hex IDs; newer records use UUIDs.
// Keep the original ID: callers must still check ownership and existence.
export const invoiceIdSchema = z.string().refine(
  (id) => /^[0-9a-f]{32}$/i.test(id) || uuidSchema.safeParse(id).success,
  "Invoice 标识格式不正确，请刷新账单列表后重试",
);
