import { redirect } from "next/navigation";
import { AuthCard, SetPasswordForm } from "@/components/AuthForms";
import { userClient } from "@/server/supabase";

// Reads the session per request: never prerendered or cached.
export const instant = false;

export const metadata = { title: "Set your password · Revloop" };

/** Reached from an invitation or reset email (which signs the user in), or from Settings. */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { welcome } = await searchParams;
  const { data } = await (await userClient()).auth.getUser();
  if (!data.user) redirect("/login?link=expired");
  return (
    <AuthCard title={welcome ? "Welcome. Set your password" : "Set a new password"} intro={`For ${data.user.email}`}>
      <SetPasswordForm />
    </AuthCard>
  );
}
