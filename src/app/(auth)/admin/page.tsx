import { redirect } from "next/navigation";
import { AddUserForm, ConnectNumberForm, CreateGarageForm } from "@/components/AuthForms";
import { Logo } from "@/components/Logo";
import { StatusLabel } from "@/components/ui";
import { DEMO_GARAGE_ID } from "@/demo/seed";
import { HOSTED } from "@/lib/mode";
import { isAdmin, listGarages, openGarage, signOut } from "@/server/auth";
import { currentMember } from "@/server/supabase";

// Reads the session per request: never prerendered or cached.
export const instant = false;

export const metadata = { title: "Admin · Revloop" };

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });

/** Platform admin console: every garage, its users and number; create garages, add users, open a dashboard. */
export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const [garages, member] = await Promise.all([listGarages(), HOSTED ? currentMember() : null]);
  const users = garages.flatMap((g) => g.members);
  const counts = [
    { label: "Garages", value: garages.length },
    { label: "Users", value: users.length },
    { label: "Not signed in yet", value: users.filter((u) => !u.confirmed).length },
  ];
  return (
    <div className="min-h-screen bg-canvas font-sans text-text">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex min-h-16 max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 md:px-8">
          <p className="flex items-center gap-3 text-base"><Logo className="h-7 w-auto" /><span className="text-muted">Admin</span></p>
          <form action={signOut} className="flex items-center gap-4 text-sm">
            <input type="hidden" name="admin" value="1" />
            <span className="text-muted">{member?.email ?? "admin (demo)"}</span>
            <button className={`inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 font-medium hover:bg-canvas ${focus}`}>Sign out</button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
        <h1 className="text-[28px] leading-tight font-[650]">Garages</h1>
        <p className="mt-1 text-sm text-muted">Every garage on Revloop, who can sign in to it, and its text number.</p>
        {!HOSTED && (
          <p role="note" className="mt-4 rounded-lg bg-attention-bg px-3 py-2 text-sm text-attention">
            Demo: garages and users you add here are kept until the app restarts, and no emails are sent. Only Riverside Garage has a dashboard to open.
          </p>
        )}

        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {counts.map((c) => (
            <li key={c.label} className="rounded-xl border border-line bg-white p-4">
              <p className="text-2xl font-semibold tabular-nums">{c.value}</p>
              <p className="text-xs text-muted">{c.label}</p>
            </li>
          ))}
        </ul>

        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section aria-labelledby="list-title" className="overflow-x-auto rounded-xl border border-line bg-white">
            <h2 id="list-title" className="sr-only">All garages</h2>
            {garages.length === 0 ? (
              <p className="p-6 text-sm text-muted">No garages yet. Create the first one with the form alongside.</p>
            ) : (
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-line text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Garage</th>
                    <th scope="col" className="px-4 py-3 font-medium">Users</th>
                    <th scope="col" className="px-4 py-3 font-medium">Text number</th>
                    <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {garages.map((g) => (
                    <tr key={g.id} className="align-top">
                      <td className="px-4 py-4">
                        <p className="font-medium">{g.name}</p>
                        <p className="text-xs text-muted">Added {date(g.created_at)}</p>
                      </td>
                      <td className="px-4 py-4">
                        {g.members.length === 0 ? (
                          <span className="text-muted">No users yet</span>
                        ) : (
                          <ul className="space-y-1.5">
                            {g.members.map((u) => (
                              <li key={u.email} className="flex flex-wrap items-center gap-2">
                                <span>{u.email}</span>
                                <span className="text-xs text-muted capitalize">{u.role}</span>
                                {!u.confirmed && <StatusLabel tone="attention">Invited</StatusLabel>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {HOSTED ? (
                          <ConnectNumberForm garageId={g.id} current={g.sms?.phone ?? ""} />
                        ) : (
                          <span className="tabular-nums text-muted">{g.sms ? `${g.sms.phone} (simulated)` : "None"}</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {(HOSTED || g.id === DEMO_GARAGE_ID) && (
                          <form action={openGarage}>
                            <input type="hidden" name="garage" value={g.id} />
                            <button className={`inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 font-medium whitespace-nowrap hover:bg-canvas ${focus}`}>Open dashboard</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <div className="space-y-6">
            <section aria-labelledby="new-garage" className="rounded-xl border border-line bg-white p-6">
              <h2 id="new-garage" className="text-lg font-semibold">New garage</h2>
              <p className="mt-1 mb-4 text-sm text-muted">Creates the garage&apos;s workspace and its owner&apos;s account.</p>
              <CreateGarageForm />
            </section>
            {garages.length > 0 && (
              <section aria-labelledby="new-user" className="rounded-xl border border-line bg-white p-6">
                <h2 id="new-user" className="text-lg font-semibold">Add a user</h2>
                <p className="mt-1 mb-4 text-sm text-muted">{HOSTED ? "They're emailed an invitation to set their password." : "Adds them to the garage's user list."}</p>
                <AddUserForm garages={garages.map(({ id, name }) => ({ id, name }))} />
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
