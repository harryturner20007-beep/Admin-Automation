import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/forgot-password", "/reset-password", "/auth/", "/api/cron/", "/api/sms/"]; // webhooks check their own signature
const REMEMBER_COOKIE = "gm-remember";

/**
 * Hosted only. Refreshes the Supabase session cookie on each request, sends signed-out visitors to the
 * sign-in page (with a note when their session had expired), and marks every response private so no
 * cache or CDN can serve one garage's page to another user. Pages and actions still check the session
 * themselves: this is the first line, not the only one.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return NextResponse.next();

  let response = NextResponse.next({ request });
  const remember = request.cookies.get(REMEMBER_COOKIE)?.value !== "0";
  const supabase = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) {
          const { maxAge, expires, ...session } = options;
          response.cookies.set(name, value, remember ? { ...session, maxAge, expires } : session);
        }
        for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;

  // Server actions check the session themselves and answer "signed out", which the save queue shows;
  // redirecting them would look like a network error instead.
  if (!data?.claims && !PUBLIC.some((p) => path.startsWith(p)) && !request.headers.has("next-action")) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    const hadSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
    if (hadSession) login.searchParams.set("expired", "1");
    if (path !== "/") login.searchParams.set("next", path + request.nextUrl.search); // back to the same record after sign-in
    const redirect = NextResponse.redirect(login);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
