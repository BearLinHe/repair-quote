import { z } from "zod";
import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { getCurrentAccount, unauthorizedResponse, writeForbiddenResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { extractPurchaseInvoice, invoiceModel } from "@/lib/purchase-invoice-ai";
import { boundedJson, purchaseImportOwners, validatedImageHash } from "@/lib/purchase-import-server";
import { auditData } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const account = await getCurrentAccount();
  if (!account) return unauthorizedResponse();
  const imports = await prisma.purchaseImport.findMany({
    where: account.role === "ADMIN" ? {} : { clerk_user_id: account.dataOwnerId ?? "" },
    select: { id: true, created_at: true, file_name: true, status: true, purchase_order_id: true, clerk_user_id: true },
    orderBy: { created_at: "desc" }, take: 20,
  });
  return Response.json({ owners: await purchaseImportOwners(account), imports, configured: Boolean(process.env.OPENAI_API_KEY), canWrite: account.role === "ADMIN" || account.canWrite });
}

export async function POST(request: Request) {
  const account = await getCurrentAccount();
  if (!account) return unauthorizedResponse();
  if (account.role !== "ADMIN" && !account.canWrite) return writeForbiddenResponse();
  if (!process.env.OPENAI_API_KEY) return apiError("AI_NOT_CONFIGURED", "尚未配置 OpenAI 服务端密钥，请联系管理员", 503);
  const parsed = z.object({ owner_id: z.string().max(200), file_name: z.string().trim().min(1).max(200), image_data_url: z.string() }).safeParse(await boundedJson(request).catch(() => null));
  if (!parsed.success) return apiError("INVALID_UPLOAD", "请上传有效图片（压缩后不超过 2.4 MB）", 400);
  const { owner_id: owner, file_name: name, image_data_url: image } = parsed.data;
  if (!(await purchaseImportOwners(account)).some((candidate) => candidate.id === owner)) return apiError("INVALID_OWNER", "无权导入该账号的库存", 403);
  let hash: string;
  try { hash = validatedImageHash(image); }
  catch (error) { return apiError("INVALID_IMAGE", error instanceof Error ? error.message : "无效图片", 400); }
  let source;
  try {
    source = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`purchase-import:${owner}`}))::text`;
      const old = await tx.purchaseImport.findUnique({ where: { clerk_user_id_file_hash: { clerk_user_id: owner, file_hash: hash } } });
      if (old?.status === "READY" || old?.status === "SAVED") return { record: old, cached: true };
      const running = await tx.purchaseImport.count({ where: { clerk_user_id: owner, status: "PROCESSING", attempted_at: { gte: new Date(Date.now() - 180000) } } });
      if (running) throw new Error("BUSY");
      const attempts = await tx.purchaseImport.aggregate({ where: { clerk_user_id: owner, attempted_at: { gte: new Date(Date.now() - 86400000) } }, _sum: { attempt_count: true } });
      if ((attempts._sum.attempt_count ?? 0) >= 30) throw new Error("LIMIT");
      const record = old ? await tx.purchaseImport.update({ where: { id: old.id }, data: { status: "PROCESSING", model: invoiceModel(), attempted_at: new Date(), attempt_count: { increment: 1 } } })
        : await tx.purchaseImport.create({ data: { clerk_user_id: owner, file_hash: hash, file_name: name, image_data_url: image, model: invoiceModel(), created_by: account.id } });
      return { record, cached: false };
    });
  } catch (error) {
    const busy = error instanceof Error && error.message === "BUSY";
    if (!busy && !(error instanceof Error && error.message === "LIMIT")) return apiError("IMPORT_UNAVAILABLE", "识别服务暂时不可用，请稍后重试", 503);
    return apiError("IMPORT_LIMIT", busy ? "该账号已有单据正在识别，请稍后在识别记录中打开" : "当前识别次数已达限制，请稍后重试或手工录入", 429);
  }
  if (source.cached) return Response.json({ id: source.record.id, cached: true });
  try {
    const extracted = await extractPurchaseInvoice(image);
    await prisma.$transaction(async (tx) => {
      await tx.purchaseImport.update({ where: { id: source.record.id }, data: { extracted, status: "READY" } });
      await tx.auditLog.create({ data: auditData({ userId: account.id, name: account.name, email: account.email }, {
        action: "PURCHASE_INVOICE_EXTRACTED", entityType: "PURCHASE_IMPORT", entityId: source.record.id,
        details: { owner_id: owner, line_count: extracted.lines.length, model: invoiceModel() },
      }) });
    });
    return Response.json({ id: source.record.id });
  } catch (error) {
    await prisma.purchaseImport.update({ where: { id: source.record.id }, data: { status: "FAILED" } });
    // Do not expose provider error bodies, credentials, or image payloads.
    const quota = error instanceof OpenAI.APIError && error.status === 429;
    const exhausted = error instanceof OpenAI.APIError && ["credit_balance_exhausted", "insufficient_quota"].includes(error.code ?? "");
    const auth = error instanceof OpenAI.APIError && [401, 403].includes(error.status ?? 0);
    return apiError("AI_EXTRACTION_FAILED", exhausted ? "OpenAI API 余额不足，请管理员充值后重试；没有增加库存" : quota ? "OpenAI 请求过多，请稍后重试；没有增加库存" : auth ? "OpenAI 密钥或模型权限不可用，请联系管理员" : "未能完整识别，请重试或拍摄更清晰的单据；没有增加库存", 502);
  }
}
