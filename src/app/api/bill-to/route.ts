import { ownerWhere, requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { uniqueBillToCompanies } from "@/lib/bill-to-options";
import { prisma } from "@/lib/db";

export async function GET() {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();

  try {
    const cases = await prisma.case.findMany({
      where: { ...ownerWhere(userId), bill_to_company: { not: null } },
      distinct: ["bill_to_company"],
      orderBy: { created_at: "desc" },
      select: { bill_to_company: true },
    });
    return Response.json(
      { companies: uniqueBillToCompanies(cases.map((item) => item.bill_to_company)) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return apiError("BILL_TO_HISTORY_FAILED", "历史公司加载失败，请稍后重试", 500);
  }
}
