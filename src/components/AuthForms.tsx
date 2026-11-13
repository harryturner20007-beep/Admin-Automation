"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { addUser, adminSignIn, createGarageAndInvite, demoSignIn, inviteColleague, requestPasswordReset, setPassword, signIn, type FormState } from "@/server/auth";
import { connectSmsNumber } from "@/server/sms";
import { Logo } from "./Logo";
import { Button, Field, inputClass } from "./ui";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const SIDES = {
  garage: {
    title: "Quotes, jobs and invoices for independent UK garages.",
    text: "Follow-ups by text, bookings, invoices and payment reminders in one workspace for your service desk.",
    switchTo: { href: "/admin/login", label: "Admin sign-in" },
  },
  admin: {
    title: "Platform administration",
    text: "Set up garages, add their staff and open a garage's dashboard to help. Each visit is recorded in that garage's audit log.",
    switchTo: { href: "/login", label: "Garage sign-in" },
  },
};

/** The sign-in screens: form on the left, a plain product panel on the right from 1024px. */
export function AuthCard({ title, intro, children, side = "garage" }: { title: string; intro?: ReactNode; children: ReactNode; side?: keyof typeof SIDES }) {
  const s = SIDES[side];
  return (
    <div className="min-h-screen bg-white font-sans text-text lg:grid lg:grid-cols-2">
      <main className="flex min-h-screen flex-col px-4 py-6 md:px-12 md:py-8">
        <p className="flex items-center gap-3 text-base">
          <Logo className="h-7 w-auto" />
          {side === "admin" && <span className="text-muted">Admin</span>}
        </p>
        <div className="flex flex-1 items-center py-10">
          <div className="mx-auto w-full max-w-[400px]">
            <h1 className="text-[28px] leading-tight font-[650]">{title}</h1>
            {intro && <div className="mt-2 text-sm text-muted">{intro}</div>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
        <footer className="flex flex-wrap justify-between gap-2 text-xs text-muted">
          <span>Revloop for independent UK garages</span>
          <Link href={s.switchTo.href} className={`underline-offset-2 hover:text-text hover:underline ${focusRing}`}>{s.switchTo.label}</Link>
        </footer>
      </main>
      <aside className="hidden border-l border-line bg-canvas lg:flex lg:flex-col lg:justify-end lg:p-12">
        <div className="max-w-md">
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <p className="mt-2 text-sm text-muted">{s.text}</p>
        </div>
      </aside>
    </div>
  );
}

function Message({ state }: { state: FormState }) {
  if (!state) return null;
  return state.error ? (
    <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>
  ) : (
    <p role="status" className="rounded-lg bg-success-bg px-3 py-2 text-sm text-success">{state.ok}</p>
  );
}

function Submit({ pending, children, busy }: { pending: boolean; children: ReactNode; busy: string }) {
  return (
    <Button type="submit" variant="primary" className="w-full" disabled={pending} aria-disabled={pending}>
      {pending ? busy : children}
    </Button>
  );
}

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-4">
      {notice && !state && <p role="status" className="rounded-lg bg-attention-bg px-3 py-2 text-sm text-attention">{notice}</p>}
      <Message state={state} />
      <input type="hidden" name="next" value={next} />
      <Field id="email" label="Email address">
        <input id="email" name="email" type="email" autoComplete="username" required className={inputClass()} />
      </Field>
      <Field id="password" label="Password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass()} />
      </Field>
      <label className="flex min-h-11 items-start gap-3 text-sm text-text">
        <input type="checkbox" name="remember" defaultChecked className={`mt-1 h-4 w-4 accent-accent ${focusRing}`} />
        <span>
          Keep me signed in on this device
          <span className="block text-xs text-muted">Leave unticked on a shared computer: you&apos;ll be signed out when the browser closes.</span>
        </span>
      </label>
      <Submit pending={pending} busy="Signing in…">Sign in</Submit>
      <p className="text-sm">
        <Link href="/forgot-password" className={`font-medium text-accent underline underline-offset-2 hover:text-accent-hover ${focusRing}`}>Forgotten your password?</Link>
      </p>
    </form>
  );
}

/** Demo copy only (no Supabase configured): the shared demo login for the sample-data dashboard. */
export function DemoLoginForm() {
  const [state, action, pending] = useActionState(demoSignIn, undefined);
  return (
    <form action={action} className="space-y-4">
      <Message state={state} />
      <Field id="username" label="Username">
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required className={inputClass()} />
      </Field>
      <Field id="password" label="Password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass()} />
      </Field>
      <Submit pending={pending} busy="Signing in…">Sign in</Submit>
      <p className="text-sm text-muted">Demo: use <b className="font-medium text-text">demo</b> for both username and password.</p>
    </form>
  );
}

/** Platform admin sign-in. Demo: admin / admin. Hosted: an email account listed in platform_admins. */
export function AdminLoginForm({ demo }: { demo: boolean }) {
  const [state, action, pending] = useActionState(adminSignIn, undefined);
  return (
    <form action={action} className="space-y-4">
      <Message state={state} />
      {demo ? (
        <Field id="username" label="Username">
          <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required className={inputClass()} />
        </Field>
      ) : (
        <Field id="email" label="Email address">
          <input id="email" name="email" type="email" autoComplete="username" required className={inputClass()} />
        </Field>
      )}
      <Field id="password" label="Password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass()} />
      </Field>
      <Submit pending={pending} busy="Signing in…">Sign in</Submit>
      {demo && <p className="text-sm text-muted">Demo: use <b className="font-medium text-text">admin</b> for both username and password.</p>}
    </form>
  );
}

/** Platform admin: add an owner or staff member to any garage. */
export function AddUserForm({ garages }: { garages: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(addUser, undefined);
  return (
    <form action={action} className="space-y-4">
      <Message state={state} />
      <Field id="user-garage" label="Garage">
        <select id="user-garage" name="garage" required className={inputClass()}>
          {garages.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </Field>
      <Field id="user-name" label="Name" optional><input id="user-name" name="name" maxLength={80} className={inputClass()} /></Field>
      <Field id="user-email" label="Email"><input id="user-email" name="email" type="email" required className={inputClass()} /></Field>
      <Field id="user-role" label="Role">
        <select id="user-role" name="role" defaultValue="staff" className={inputClass()}>
          <option value="staff">Staff</option>
          <option value="owner">Owner</option>
        </select>
      </Field>
      <Submit pending={pending} busy="Adding…">Add user</Submit>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="space-y-4">
      <Message state={state} />
      <Field id="email" label="Email address">
        <input id="email" name="email" type="email" autoComplete="username" required className={inputClass()} />
      </Field>
      <Submit pending={pending} busy="Sending…">Email me a reset link</Submit>
      <p className="text-sm"><Link href="/login" className={`font-medium text-accent underline underline-offset-2 ${focusRing}`}>Back to sign in</Link></p>
    </form>
  );
}

export function SetPasswordForm() {
  const [state, action, pending] = useActionState(setPassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <Message state={state} />
      <Field id="password" label="New password" hint="At least 10 characters. A few unrelated words work well.">
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className={inputClass()} />
      </Field>
      <Field id="confirm" label="Type it again">
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required className={inputClass()} />
      </Field>
      <Submit pending={pending} busy="Saving…">Save password and continue</Submit>
    </form>
  );
}

export function CreateGarageForm() {
  const [state, action, pending] = useActionState(createGarageAndInvite, undefined);
  const [key, setKey] = useState(0);
  return (
    <form key={key} action={async (f) => { await action(f); }} className="space-y-4">
      <Message state={state} />
      <Field id="garage" label="Garage name"><input id="garage" name="garage" required maxLength={120} className={inputClass()} /></Field>
      <Field id="name" label="Owner's name" optional><input id="name" name="name" maxLength={80} className={inputClass()} /></Field>
      <Field id="email" label="Owner's email" hint="They're emailed an invitation to set their password."><input id="email" name="email" type="email" required className={inputClass()} /></Field>
      <Submit pending={pending} busy="Creating…">Create garage</Submit>
      {state?.ok && <Button type="button" className="w-full" onClick={() => setKey((k) => k + 1)}>Add another garage</Button>}
    </form>
  );
}

export function InviteColleagueForm() {
  const [state, action, pending] = useActionState(inviteColleague, undefined);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <Field id="colleague-name" label="Name" optional><input id="colleague-name" name="name" maxLength={80} className={inputClass()} /></Field>
      <Field id="colleague-email" label="Email"><input id="colleague-email" name="email" type="email" required className={inputClass()} /></Field>
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Invite"}</Button>
      <div className="md:col-span-3"><Message state={state} /></div>
    </form>
  );
}

/** Platform admin: connect (or change) a garage's sending number. Checked against the Twilio account. */
export function ConnectNumberForm({ garageId, current }: { garageId: string; current: string }) {
  const [state, action, pending] = useActionState(connectSmsNumber, undefined);
  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
      <input type="hidden" name="garage" value={garageId} />
      <label className="text-xs text-muted">
        SMS number
        <input name="phone" defaultValue={current} placeholder="+44 7…" className={`${inputClass()} mt-1 w-44 tabular-nums`} />
      </label>
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Checking…" : current ? "Update" : "Connect"}</Button>
      <div className="w-full"><Message state={state} /></div>
    </form>
  );
}
