import { createHash, timingSafeEqual } from "node:crypto";

// The shared sign-ins for the sample-data demo. They exist only when no Supabase project is configured
// (HOSTED is false); a hosted deployment never accepts them. They guard sample data, not customer data.
export const DEMO_COOKIE = "gm-demo";
export const DEMO_ADMIN_COOKIE = "gm-demo-admin";
export const DEMO_USERNAME = "demo";
export const DEMO_PASSWORD = "demo";
export const DEMO_ADMIN_USERNAME = "admin";
export const DEMO_ADMIN_PASSWORD = "admin";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Username ignores case and surrounding spaces; the password must match exactly. Both are always compared. */
function matches(username: string, password: string, u: string, p: string): boolean {
  const user = timingSafeEqual(digest(username.trim().toLowerCase()), digest(u));
  const pass = timingSafeEqual(digest(password), digest(p));
  return user && pass;
}

export const checkDemoCredentials = (username: string, password: string) => matches(username, password, DEMO_USERNAME, DEMO_PASSWORD);
export const checkDemoAdminCredentials = (username: string, password: string) => matches(username, password, DEMO_ADMIN_USERNAME, DEMO_ADMIN_PASSWORD);
