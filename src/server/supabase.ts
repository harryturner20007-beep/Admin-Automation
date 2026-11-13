// Supabase clients for the server. Never import this from a client component.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

if (typeof window !== "undefined") throw new Error("server/supabase is server-only");

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Set at sign-in when "Keep me signed in" is unticked; itself a browser-session cookie. */
export const REMEMBER_COOKIE = "gm-remember";

/**
 * "Keep me signed in on this device": Supabase keeps the session in cookies that the browser stores for
 * up to 400 days and refreshes as it is used. Unticked, the same cookies are written without an expiry,
 * so the browser drops them when it closes. Either way the server checks the session on every request.
 */
export function cookieOptionsFor(remember: boolean, options: CookieOptions): CookieOptions {
  if (remember) return options;
  const { maxAge: _m, expires: _e, ...session } = options;
  return session;
}

/** A client acting as the signed-in user: every query runs under row-level security. */
export async function userClient() {
  const store = await cookies();
  const remember = store.get(REMEMBER_COOKIE)?.value !== "0";
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, cookieOptionsFor(remember, options));
        } catch {
          // Called from a Server Component, where cookies are read-only; the proxy refreshes them instead.
        }
      },
    },
  });
}

/**
 * The privileged client (service role). Only for the write path after the caller's membership has been
 * checked, the platform-admin screen and the reminder scheduler. The key never leaves the server.
 */
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type Member = { userId: string; email: string; garageId: string; garageName: string; role: "owner" | "staff"; displayName: string; platformAdmin: boolean; adminView?: boolean };

/** Which garage a platform admin has opened. Only honoured after the admin check below, on every request. */
export const ADMIN_GARAGE_COOKIE = "gm-admin-garage";

/** The signed-in user and their garage, checked with Supabase Auth (not just read from the cookie). */
export async function currentMember(): Promise<Member | null> {
  const supabase = await userClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const [{ data: m }, { data: admin }] = await Promise.all([
    supabase.from("memberships").select("garage_id, role, display_name, garages(name)").eq("user_id", data.user.id).limit(1).maybeSingle(),
    supabase.from("platform_admins").select("user_id").eq("user_id", data.user.id).maybeSingle(),
  ]);
  // A platform admin who has opened a garage works in it as an owner. The cookie alone grants nothing:
  // it is only read after the database has confirmed this user is a platform admin.
  const opened = admin ? (await cookies()).get(ADMIN_GARAGE_COOKIE)?.value : undefined;
  if (opened && /^[0-9a-f-]{36}$/.test(opened)) {
    const { data: g } = await adminClient().from("garages").select("id, name").eq("id", opened).maybeSingle();
    if (g) return { userId: data.user.id, email: data.user.email ?? "", garageId: g.id, garageName: g.name, role: "owner", displayName: `${data.user.email} (platform admin)`, platformAdmin: true, adminView: true };
  }
  if (!m) return admin ? { userId: data.user.id, email: data.user.email ?? "", garageId: "", garageName: "", role: "staff", displayName: data.user.email ?? "", platformAdmin: true } : null;
  const garages = m.garages as unknown as { name: string } | null;
  return {
    userId: data.user.id,
    email: data.user.email ?? "",
    garageId: m.garage_id,
    garageName: garages?.name ?? "",
    role: m.role,
    displayName: m.display_name || data.user.email || "Staff",
    platformAdmin: !!admin,
  };
}
