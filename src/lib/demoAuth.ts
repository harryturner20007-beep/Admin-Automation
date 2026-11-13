import { createHash, timingSafeEqual } from "node:crypto";

// The shared sign-in for the sample-data demo. It exists only when no Supabase project is configured
// (HOSTED is false); a hosted deployment never accepts it. It guards sample data, not customer data.
export const DEMO_COOKIE = "gm-demo";
export const DEMO_USERNAME = "demo";
export const DEMO_PASSWORD = "demo";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Username ignores case and surrounding spaces; the password must match exactly. Both are always compared. */
export function checkDemoCredentials(username: string, password: string): boolean {
  const user = timingSafeEqual(digest(username.trim().toLowerCase()), digest(DEMO_USERNAME));
  const pass = timingSafeEqual(digest(password), digest(DEMO_PASSWORD));
  return user && pass;
}
