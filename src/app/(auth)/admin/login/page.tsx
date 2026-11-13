import { redirect } from "next/navigation";
import { AdminLoginForm, AuthCard } from "@/components/AuthForms";
import { HOSTED } from "@/lib/mode";
import { isAdmin } from "@/server/auth";

// Reads the session per request: never prerendered or cached.
export const instant = false;

export const metadata = { title: "Admin sign-in · Revloop" };

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");
  return (
    <AuthCard side="admin" title="Admin sign-in" intro="For the people who run Revloop. Garage staff sign in on the garage sign-in page.">
      <AdminLoginForm demo={!HOSTED} />
    </AuthCard>
  );
}
