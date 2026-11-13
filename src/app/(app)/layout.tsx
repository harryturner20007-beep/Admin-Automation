import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE } from "@/lib/demoAuth";
import { Shell } from "@/components/Shell";
import { DemoProvider } from "@/demo/store";
import { HOSTED } from "@/lib/mode";
import { currentMember } from "@/server/supabase";
import { loadWorkspace } from "@/server/workspace";

// Hosted: the signed-in member's garage, loaded on the server for every visit (never cached across users).
// Without Supabase configured, the same screens run as the browser-only demo with sample data.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!HOSTED) {
    if (!(await cookies()).get(DEMO_COOKIE)) redirect("/login"); // the demo has its own sign-in too
    return (
      <DemoProvider>
        <Shell user={{ email: "demo", garageName: "Riverside Garage (demo)", platformAdmin: false }}>{children}</Shell>
      </DemoProvider>
    );
  }
  const member = await currentMember();
  if (!member) redirect("/login");
  if (!member.garageId) redirect("/admin");
  const loaded = await loadWorkspace();
  if (!loaded) redirect("/login");
  return (
    <DemoProvider hosted={loaded}>
      <Shell user={{ email: member.email, garageName: member.garageName, platformAdmin: member.platformAdmin, adminView: !!member.adminView }}>{children}</Shell>
    </DemoProvider>
  );
}
