import { auth } from "@clerk/nextjs/server";
import { apiError } from "@/lib/api-error";

export async function requireAuth() {
  const { userId } = await auth();
  return userId;
}

export function unauthorizedResponse() {
  return apiError("UNAUTHORIZED", "请先登录", 401);
}

export async function getAuthUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}
