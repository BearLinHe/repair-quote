import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";
import { createSessionToken, hashSessionToken, SESSION_COOKIE, sessionExpiry } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

const loginSchema = z.object({ login: z.string().trim().min(1).max(254), password: z.string().min(1).max(128) });
const DUMMY_HASH = "scrypt$00000000000000000000000000000000$6b71742c54a29d5d4f291d097ff6d76886fa7b32c9b07d79f60852090e7a882c9d086859446876afa2b8929c27f9692116546737a56f3c09ebf87f727e93d0f3";

export async function POST(req: Request) {
  const parsed = loginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "请输入账号和密码", 400);
  const login = parsed.data.login.toLowerCase();
  const user = await prisma.appUser.findUnique({ where: { login } });
  if (user?.locked_until && user.locked_until > new Date()) return apiError("ACCOUNT_LOCKED", "登录失败次数过多，请15分钟后再试", 429);
  const passwordMatches = await verifyPassword(parsed.data.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !passwordMatches) {
    if (user) {
      const failures = user.failed_login_count + 1;
      await prisma.appUser.update({ where: { id: user.id }, data: { failed_login_count: failures, locked_until: failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null } });
    }
    return apiError("INVALID_CREDENTIALS", "账号或密码不正确", 401);
  }
  const token = createSessionToken();
  const expiresAt = sessionExpiry();
  await prisma.$transaction([
    prisma.appUser.update({ where: { id: user.id }, data: { failed_login_count: 0, locked_until: null } }),
    prisma.appSession.deleteMany({ where: { app_user_id: user.id, expires_at: { lt: new Date() } } }),
    prisma.appSession.create({ data: { app_user_id: user.id, token_hash: hashSessionToken(token), expires_at: expiresAt } }),
  ]);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
  return Response.json({ user: { name: user.name, login: user.login, role: user.role } });
}
