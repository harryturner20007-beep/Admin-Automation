import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthCard, ConnectNumberForm, CreateGarageForm } from "@/components/AuthForms";
import { HOSTED } from "@/lib/mode";
import { listGarages, openGarage, signOut } from "@/server/auth";
import { currentMember } from "@/server/supabase";

// Reads the session per request: never prerendered or cached.
export const instant = false;

export const metadata = { title: "Platform admin · Garage desk" };

/** Platform admin only: create a garage and invite its owner. Anyone else gets a plain 404. */
export default async function AdminPage() {
  if (!HOSTED) notFound();
  const m = await currentMember();
  if (!m?.platformAdmin) notFound();
  const garages = await listGarages();
  return (
    <AuthCard title="Garages" intro={<>Signed in as {m.email}. {m.garageId && <Link href="/overview" className="text-accent underline">Open your garage</Link>}</>}>
      <CreateGarageForm />
      <h2 className="mt-8 text-lg font-semibold text-text">All garages ({garages.length})</h2>
      <ul className="mt-2 divide-y divide-line text-sm">
        {garages.map((g) => (
          <li key={g.id} className="py-2">
            <span className="font-medium text-text">{g.name}</span>
            <span className="block text-xs text-muted">
              {g.members.map((x) => `${x.email} (${x.role}${x.confirmed ? "" : ", invited"})`).join(", ") || "No members yet"}
            </span>
                      <span className="block text-xs text-muted">{g.sms ? `Texts from ${g.sms.phone} (${g.sms.status})` : "No SMS number yet"}</span>
            <form action={openGarage} className="mt-2">
              <input type="hidden" name="garage" value={g.id} />
              <button className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover">Open dashboard</button>
            </form>
            <ConnectNumberForm garageId={g.id} current={g.sms?.phone ?? ""} />
          </li>
        ))}
      </ul>
      <form action={signOut} className="mt-6">
        <button className="min-h-11 text-sm font-medium text-muted underline">Sign out</button>
      </form>
    </AuthCard>
  );
}
