import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_ADMIN_COOKIE, DEMO_COOKIE } from "@/lib/demoAuth";
import { Shell } from "@/components/Shell";
import { DemoProvider } from "@/demo/store";
import { HOSTED } from "@/lib/mode";
import { currentMember } from "@/server/supabase";
import { loadWorkspace } from "@/server/workspace";

// Hosted: the signed-in member's garage, loaded on the server for every visit (never cached across users).
// Without Supabase configured, the same screens run as the browser-only demo with sample data.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!HOSTED) {
    const jar = await cookies();
    if (!jar.get(DEMO_COOKIE)) redirect("/login"); // the demo has its own sign-in too
    const admin = !!jar.get(DEMO_ADMIN_COOKIE);
    return (
      <DemoProvider>
        <Shell user={{ email: admin ? "admin" : "demo", garageName: "Riverside Garage (demo)", platformAdmin: admin, adminView: admin }}>{children}</Shell>
      </DemoProvider>
    );
  }
  const member = await currentMember();
  if (!member && (await cookies()).get(DEMO_COOKIE)) {
    // The free demo on the live site: sample data in the visitor's browser, nothing from any garage.
    return (
      <DemoProvider>
        <Shell user={{ email: "demo", garageName: "Riverside Garage (demo)", platformAdmin: false }}>{children}</Shell>
      </DemoProvider>
    );
  }
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
