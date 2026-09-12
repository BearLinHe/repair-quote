import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/api-error";

export const SESSION_COOKIE = "yaoyuan_session";
export const ADMIN_SCOPE_ID = "__ADMIN__";
const SESSION_DAYS = 30;

export type CurrentAccount = {
  id: string;
  login: string;
  email: string | null;
  name: string;
  role: "USER" | "ADMIN";
  dataOwnerId: string | null;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function sessionExpiry() {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

export async function getCurrentAccount(): Promise<CurrentAccount | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.appSession.findUnique({
    where: { token_hash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session || session.expires_at <= new Date()) return null;
  return {
    id: session.user.id,
    login: session.user.login,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    dataOwnerId: session.user.data_owner_id,
  };
}

export async function requireAuth() {
  const account = await getCurrentAccount();
  if (!account) return null;
  return account.role === "ADMIN" ? ADMIN_SCOPE_ID : account.dataOwnerId;
}

export function unauthorizedResponse() {
  return apiError("UNAUTHORIZED", "请先登录", 401);
}

export async function getAuthUserId(): Promise<string | null> {
  return requireAuth();
}

export function isAdminScope(userId: string) {
  return userId === ADMIN_SCOPE_ID;
}

export function canAccessOwner(userId: string, ownerId: string) {
  return isAdminScope(userId) || userId === ownerId;
}

export function ownerWhere(userId: string) {
  return isAdminScope(userId) ? {} : { clerk_user_id: userId };
}

export function adminReadOnlyResponse() {
  return apiError("ADMIN_READ_ONLY", "管理员账号当前为全局只读账号", 403);
}
