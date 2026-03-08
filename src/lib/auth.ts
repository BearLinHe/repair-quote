import { auth } from "@clerk/nextjs/server";

export async function requireAuth() {
  const { userId } = await auth();
  if (!userId) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return userId;
}

export async function getAuthUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}
