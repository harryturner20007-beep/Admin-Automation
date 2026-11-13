"use server";
// Sign-in, password reset, invitation acceptance, sign-out and the platform-admin onboarding actions.
// Passwords are handled by Supabase Auth only; this code never stores or logs them.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { newWorkspace } from "@/domain/workspace";
import { checkDemoAdminCredentials, checkDemoCredentials, DEMO_ADMIN_COOKIE, DEMO_COOKIE } from "@/lib/demoAuth";
import { DEMO_GARAGE_ID } from "@/demo/seed";
import { demoAddUser, demoCreateGarage, demoGarages } from "./demoAdmin";
import { HOSTED } from "@/lib/mode";
import { ADMIN_GARAGE_COOKIE, adminClient, currentMember, REMEMBER_COOKIE, userClient } from "./supabase";

export type FormState = { error?: string; ok?: string } | undefined;

const SITE_URL = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const email = (v: FormDataEntryValue | null) => String(v ?? "").trim().toLowerCase();
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
/** Only same-site paths, so a crafted link can't send someone off-site after sign-in. */
const safeNext = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "");
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/overview";
};
const MIN_PASSWORD = 10;

/** Sign in to the sample-data demo with the shared demo login. Never available on a hosted deployment. */
export async function demoSignIn(_: FormState, form: FormData): Promise<FormState> {
  if (HOSTED) return { error: "Demo sign-in isn't available here." };
  if (!checkDemoCredentials(String(form.get("username") ?? ""), String(form.get("password") ?? ""))) return { error: "That username and password don't match." };
  (await cookies()).set(DEMO_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 3600 });
  redirect("/overview");
}

const demoCookie = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 3600 };

/** Platform admin sign-in. Hosted: a Supabase account that is in platform_admins; anyone else is signed straight out again. */
export async function adminSignIn(_: FormState, form: FormData): Promise<FormState> {
  const denied = { error: "Those details don't match an admin account." }; // same message for every failure
  if (!HOSTED) {
    if (!checkDemoAdminCredentials(String(form.get("username") ?? ""), String(form.get("password") ?? ""))) return denied;
    (await cookies()).set(DEMO_ADMIN_COOKIE, "1", demoCookie);
    redirect("/admin");
  }
  const address = email(form.get("email"));
  const password = String(form.get("password") ?? "");
  if (!isEmail(address) || !password) return { error: "Enter your email address and password." };
  (await cookies()).set(REMEMBER_COOKIE, "0", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" }); // admin sessions end with the browser
  const supabase = await userClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: address, password });
  if (error) return error.status === 429 ? { error: "Too many attempts. Wait a few minutes and try again." } : denied;
  const { data: row } = await adminClient().from("platform_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!row) {
    await supabase.auth.signOut({ scope: "local" });
    return denied;
  }
  redirect("/admin");
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const address = email(form.get("email"));
  const password = String(form.get("password") ?? "");
  if (!isEmail(address) || !password) return { error: "Enter your email address and password." };
  const store = await cookies();
  // Must be set before the session cookies are written, so they get (or don't get) an expiry.
  if (form.get("remember") === "on") store.delete(REMEMBER_COOKIE);
  else store.set(REMEMBER_COOKIE, "0", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  const supabase = await userClient();
  const { error } = await supabase.auth.signInWithPassword({ email: address, password });
  if (error) {
    if (error.status === 429) return { error: "Too many attempts. Wait a few minutes and try again." };
    return { error: "That email and password don't match an account." }; // same message whether or not the email exists
  }
  redirect(safeNext(form.get("next")));
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const address = email(form.get("email"));
  if (!isEmail(address)) return { error: "Enter the email address you sign in with." };
  const supabase = await userClient();
  const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: `${SITE_URL()}/auth/confirm?next=/reset-password` });
  if (error?.status === 429) return { error: "Too many requests. Wait a few minutes and try again." };
  // The same answer either way, so this form can't be used to find out who has an account.
  return { ok: "If that address has an account, we've emailed a link to set a new password. It expires in 1 hour." };
}

/** Set a password: after following an invitation or reset link (which signs the user in) or from Settings. */
export async function setPassword(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  if (password.length < MIN_PASSWORD) return { error: `Use at least ${MIN_PASSWORD} characters.` };
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords don't match." };
  const supabase = await userClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "This link has expired. Ask for a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.code === "weak_password" || error.code === "same_password" ? error.message : "Couldn't set the password. Try again." };
  redirect("/overview");
}

/** Sign out here, or everywhere (revokes every session's refresh token). */
export async function signOut(form: FormData) {
  const to = form.get("admin") ? "/admin/login" : "/login";
  if (!HOSTED) {
    const store = await cookies();
    store.delete(DEMO_COOKIE);
    store.delete(DEMO_ADMIN_COOKIE);
    redirect(to);
  }
  const supabase = await userClient();
  await supabase.auth.signOut({ scope: form.get("everywhere") === "on" ? "global" : "local" });
  const store = await cookies();
  store.delete(DEMO_COOKIE);
  store.delete(REMEMBER_COOKIE);
  store.delete(ADMIN_GARAGE_COOKIE);
  redirect(to);
}

// ---------- platform admin: onboard a garage ----------

/** Demo: the admin cookie. Hosted: a platform admin's session. */
export async function isAdmin(): Promise<boolean> {
  if (!HOSTED) return !!(await cookies()).get(DEMO_ADMIN_COOKIE);
  return !!(await currentMember())?.platformAdmin;
}

async function requireAdmin() {
  const m = await currentMember();
  if (!m?.platformAdmin) throw new Error("Not allowed");
  return m;
}

export type GarageRow = { id: string; name: string; created_at: string; members: { email: string; role: string; confirmed: boolean }[]; sms: { phone: string; status: string } | null };

export async function listGarages(): Promise<GarageRow[]> {
  if (!HOSTED) {
    if (!(await isAdmin())) throw new Error("Not allowed");
    return demoGarages();
  }
  await requireAdmin();
  const admin = adminClient();
  const [{ data: garages }, { data: members }, { data: users }, { data: numbers }] = await Promise.all([
    admin.from("garages").select("id, name, created_at").order("created_at", { ascending: false }),
    admin.from("memberships").select("garage_id, user_id, role"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("sms_numbers").select("garage_id, phone_e164, status"),
  ]);
  const byId = new Map((users?.users ?? []).map((u) => [u.id, u]));
  return (garages ?? []).map((g) => ({
    ...g,
    sms: (numbers ?? []).filter((n) => n.garage_id === g.id).map((n) => ({ phone: n.phone_e164, status: n.status }))[0] ?? null,
    members: (members ?? []).filter((x) => x.garage_id === g.id).map((x) => ({ email: byId.get(x.user_id)?.email ?? "?", role: x.role, confirmed: !!byId.get(x.user_id)?.last_sign_in_at })),
  }));
}

async function invite(garageId: string, address: string, role: "owner" | "staff", displayName: string): Promise<string | null> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(address, { redirectTo: `${SITE_URL()}/auth/confirm?next=/reset-password` });
  if (error || !data.user) return error?.code === "email_exists" ? "That email already has an account. Each account belongs to one garage." : "Couldn't send the invitation. Check the email settings in Supabase.";
  const { error: e2 } = await admin.from("memberships").insert({ user_id: data.user.id, garage_id: garageId, role, display_name: displayName });
  return e2 ? "The invitation was sent but the account couldn't be linked to the garage." : null;
}

export async function createGarageAndInvite(_: FormState, form: FormData): Promise<FormState> {
  if (!(await isAdmin())) return { error: "Only platform admins can do this." };
  const name = String(form.get("garage") ?? "").trim();
  const owner = email(form.get("email"));
  const ownerName = String(form.get("name") ?? "").trim().slice(0, 80);
  if (!name || name.length > 120) return { error: "Enter the garage's name." };
  if (!isEmail(owner)) return { error: "Enter the owner's email address." };
  revalidatePath("/admin");
  if (!HOSTED) {
    if (demoGarages().some((g) => g.members.some((m) => m.email === owner))) return { error: "That email already has an account. Each account belongs to one garage." };
    demoCreateGarage(name, owner);
    return { ok: `${name} added. Demo only: no invitation email was sent.` };
  }
  const template = newWorkspace("pending", name, new Date().toISOString());
  const { data: garageId, error } = await adminClient().rpc("create_garage", { p_name: name, p_doc_template: template });
  if (error || !garageId) return { error: "Couldn't create the garage." };
  const problem = await invite(garageId as string, owner, "owner", ownerName);
  if (problem) return { error: `${name} was created, but: ${problem}` };
  return { ok: `${name} created. ${owner} has been emailed an invitation to set their password.` };
}

/** Platform admin adds a user (owner or staff) to any garage. They're emailed an invitation to set a password. */
export async function addUser(_: FormState, form: FormData): Promise<FormState> {
  if (!(await isAdmin())) return { error: "Only platform admins can do this." };
  const garageId = String(form.get("garage") ?? "");
  const address = email(form.get("email"));
  const role = form.get("role") === "owner" ? "owner" : "staff";
  if (!isEmail(address)) return { error: "Enter their email address." };
  revalidatePath("/admin");
  if (!HOSTED) {
    const problem = demoAddUser(garageId, address, role);
    return problem ? { error: problem } : { ok: `${address} added as ${role}. Demo only: no invitation email was sent.` };
  }
  const { data: g } = await adminClient().from("garages").select("id, name").eq("id", garageId).maybeSingle();
  if (!g) return { error: "Choose a garage." };
  const problem = await invite(g.id, address, role, String(form.get("name") ?? "").trim().slice(0, 80));
  return problem ? { error: problem } : { ok: `${address} added to ${g.name} as ${role}, and emailed an invitation to set a password.` };
}

/** Garage owners invite colleagues to their own garage (staff accounts). */
export async function inviteColleague(_: FormState, form: FormData): Promise<FormState> {
  const m = await currentMember();
  if (!m?.garageId || m.role !== "owner") return { error: "Only the garage owner can invite people." };
  const address = email(form.get("email"));
  if (!isEmail(address)) return { error: "Enter their email address." };
  const problem = await invite(m.garageId, address, "staff", String(form.get("name") ?? "").trim().slice(0, 80));
  return problem ? { error: problem } : { ok: `Invitation emailed to ${address}.` };
}

/** Platform admin opens a garage's dashboard (to support or set it up). Recorded in that garage's audit log. */
export async function openGarage(form: FormData) {
  const id = String(form.get("garage") ?? "");
  if (!HOSTED) {
    if (!(await isAdmin()) || id !== DEMO_GARAGE_ID) throw new Error("Not allowed"); // only the sample garage has a dashboard in the demo
    (await cookies()).set(DEMO_COOKIE, "1", demoCookie);
    redirect("/overview");
  }
  const m = await requireAdmin();
  const admin = adminClient();
  const { data: g } = await admin.from("garages").select("id").eq("id", id).maybeSingle();
  if (!g) throw new Error("Garage not found");
  await admin.from("audit_log").insert({ garage_id: g.id, user_id: m.userId, op: "platform admin opened the dashboard", version: 0 });
  (await cookies()).set(ADMIN_GARAGE_COOKIE, g.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 3600 });
  redirect("/overview");
}

/** Back to the admin screen. */
export async function leaveGarage() {
  (await cookies()).delete(ADMIN_GARAGE_COOKIE);
  redirect("/admin");
}
