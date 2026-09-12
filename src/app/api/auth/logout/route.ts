import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { hashSessionToken, SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await prisma.appSession.deleteMany({ where: { token_hash: hashSessionToken(token) } });
  cookieStore.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
