import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { DemoProvider } from "@/demo/store";
import { HOSTED } from "@/lib/mode";
import { currentMember } from "@/server/supabase";
import { loadWorkspace } from "@/server/workspace";

// Hosted: the signed-in member's garage, loaded on the server for every visit (never cached across users).
// Without Supabase configured, the same screens run as the browser-only demo with sample data.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!HOSTED) {
    return (
      <DemoProvider>
        <Shell>{children}</Shell>
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
