import { NextRequest, NextResponse } from "next/server";

const protectedPrefixes = ["/dashboard", "/cases", "/purchases", "/inventory", "/finance", "/settings"];

export function middleware(req: NextRequest) {
  const protectedPage = protectedPrefixes.some((prefix) => req.nextUrl.pathname.startsWith(prefix));
  if (protectedPage && !req.cookies.get("yaoyuan_session")?.value) {
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set("redirect_url", `${req.nextUrl.pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(signIn);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
