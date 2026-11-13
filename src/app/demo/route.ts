import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/demoAuth";

/**
 * The free live demo: no account needed. Sets the demo cookie and opens the dashboard. The demo runs on
 * sample data held in the visitor's own browser, so it never touches a real garage's records, hosted or not.
 */
export function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/overview";
  url.search = "";
  const response = NextResponse.redirect(url);
  response.cookies.set(DEMO_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 3600 });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
