import Link from "next/link";
import { redirect } from "next/navigation";
import { currentMember } from "@/server/supabase";
import { AuthCard, LoginForm } from "@/components/AuthForms";
import { HOSTED } from "@/lib/mode";

// Reads the session per request: never prerendered or cached.
export const instant = false;

export const metadata = { title: "Sign in · Garage desk" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const p = await searchParams;
  if (!HOSTED) {
    return (
      <AuthCard title="Sign in" intro="Accounts aren't set up on this copy. It runs as a demo with sample data.">
        <Link href="/overview" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover">Open the demo</Link>
      </AuthCard>
    );
  }
  const member = await currentMember();
  if (member) redirect(member.garageId ? "/overview" : "/admin"); // already signed in
  const next = typeof p.next === "string" ? p.next : "/overview";
  const notice = p.expired ? "Your session ended. Sign in again to carry on." : p.link === "expired" ? "That link has expired or was already used. Ask for a new one." : undefined;
  return (
    <AuthCard title="Sign in" intro="Your garage's quotes, jobs and invoices.">
      <LoginForm next={next} notice={notice} />
    </AuthCard>
  );
}
