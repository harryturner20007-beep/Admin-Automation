import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE } from "@/lib/demoAuth";
import { currentMember } from "@/server/supabase";
import { AuthCard, DemoLoginForm, LoginForm } from "@/components/AuthForms";
import { HOSTED } from "@/lib/mode";

// Reads the session per request: never prerendered or cached.
export const instant = false;

export const metadata = { title: "Sign in · Revloop" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const p = await searchParams;
  if (!HOSTED) {
    if ((await cookies()).get(DEMO_COOKIE)) redirect("/overview"); // already signed in to the demo
    return (
      <AuthCard title="Sign in to your garage" intro="This copy is a demo with sample data.">
        <DemoLoginForm />
      </AuthCard>
    );
  }
  const member = await currentMember();
  if (member) redirect(member.garageId ? "/overview" : "/admin"); // already signed in
  const next = typeof p.next === "string" ? p.next : "/overview";
  const notice = p.expired ? "Your session ended. Sign in again to carry on." : p.link === "expired" ? "That link has expired or was already used. Ask for a new one." : undefined;
  return (
    <AuthCard title="Sign in to your garage" intro="Use the email address your invitation was sent to.">
      <LoginForm next={next} notice={notice} />
    </AuthCard>
  );
}
