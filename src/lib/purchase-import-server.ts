import { createHash } from "node:crypto";
import { prisma } from "./db";
import { ADMIN_SCOPE_ID, type CurrentAccount } from "./auth";
import { IMPORT_IMAGE_LIMIT } from "./purchase-import";

export async function purchaseImportOwners(account: CurrentAccount) {
  if (account.role !== "ADMIN") return account.dataOwnerId ? [{ id: account.dataOwnerId, name: account.name }] : [];
  const [users, items] = await Promise.all([
    prisma.appUser.findMany({ where: { data_owner_id: { not: null } }, select: { data_owner_id: true, name: true } }),
    prisma.inventoryItem.findMany({ distinct: ["clerk_user_id"], select: { clerk_user_id: true } }),
  ]);
  const owners = new Map<string, string>([[ADMIN_SCOPE_ID, "管理员库存"]]);
  for (const item of items) owners.set(item.clerk_user_id, item.clerk_user_id);
  for (const user of users) if (user.data_owner_id) owners.set(user.data_owner_id, user.name);
  return [...owners].map(([id, name]) => ({ id, name }));
}

export function validatedImageHash(value: string) {
  if (value.length > IMPORT_IMAGE_LIMIT) throw new Error("图片过大，请重新上传压缩后的照片");
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error("仅支持 JPG、PNG 或 WebP 图片");
  const bytes = Buffer.from(match[2], "base64");
  const valid = match[1] === "jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    : match[1] === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  if (!valid) throw new Error("图片内容与格式不符，请重新选择照片");
  return createHash("sha256").update(bytes).digest("hex");
}

export async function boundedJson(request: Request, max = IMPORT_IMAGE_LIMIT + 10000): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("请求为空");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) { await reader.cancel(); throw new Error("上传内容过大"); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
