// Runs the real Supabase migration on an in-process Postgres (PGlite) with the small parts of Supabase it
// relies on stubbed (auth.uid(), the anon/authenticated/service_role roles, storage tables), then checks
// tenant isolation, the write path, optimistic locking and invoice immutability with two garages.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newWorkspace } from "@/domain/workspace";

const SUPABASE_STUBS = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select on storage.objects to authenticated;
-- Supabase gives API roles table rights by default; the migration must take away what they must not have.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

const A_USER = "11111111-1111-1111-1111-111111111111";
const B_USER = "22222222-2222-2222-2222-222222222222";
let db: PGlite;
let garageA: string;
let garageB: string;

/** Run SQL as a role, optionally signed in as a user, like PostgREST does for each request. */
async function as<T = Record<string, unknown>>(role: "anon" | "authenticated" | "service_role", user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ""}', false); set role ${role};`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role;");
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));
  await db.exec(`insert into auth.users (id, email) values ('${A_USER}', 'a@example.com'), ('${B_USER}', 'b@example.com');`);
  const template = JSON.stringify(newWorkspace("PLACEHOLDER", "Garage", "2026-11-12T09:00:00.000Z"));
  garageA = (await as<{ g: string }>("service_role", null, "select public.create_garage('Alpha Motors', $1::jsonb) g", [template]))[0].g;
  garageB = (await as<{ g: string }>("service_role", null, "select public.create_garage('Bravo Autos', $1::jsonb) g", [template]))[0].g;
  await db.exec(`insert into public.memberships (user_id, garage_id, role) values ('${A_USER}', '${garageA}', 'owner'), ('${B_USER}', '${garageB}', 'owner');`);
  await db.exec(`insert into storage.objects (bucket_id, name) values ('garage-files', '${garageA}/invoices/inv_1.pdf'), ('garage-files', '${garageB}/invoices/inv_1.pdf');`);
}, 60_000);

afterAll(() => db?.close());

const save = (user: string | null, garage: string, version: number, doc: unknown, issued: unknown = null) =>
  as<{ v: number }>("service_role", null, "select public.save_workspace($1, $2, $3::jsonb, 'test', $4, $5::jsonb) v", [garage, version, JSON.stringify(doc), user, issued && JSON.stringify(issued)]);
const docOf = async (garage: string) => (await as<{ doc: ReturnType<typeof newWorkspace>; version: number }>("service_role", null, "select doc, version from public.workspaces where garage_id = $1", [garage]))[0];

describe("garage isolation", () => {
  it("each member reads only their own garage's workspace, garage and files", async () => {
    const a = await as<{ garage_id: string }>("authenticated", A_USER, "select garage_id from public.workspaces");
    expect(a.map((r) => r.garage_id)).toEqual([garageA]);
    expect((await as("authenticated", B_USER, "select name from public.garages")).map((r) => r.name)).toEqual(["Bravo Autos"]);
    // Tampered request: asking for the other garage by id returns nothing.
    expect(await as("authenticated", A_USER, "select * from public.workspaces where garage_id = $1", [garageB])).toEqual([]);
    expect((await as<{ name: string }>("authenticated", A_USER, "select name from storage.objects")).map((r) => r.name)).toEqual([`${garageA}/invoices/inv_1.pdf`]);
  });

  it("signed-out requests see nothing", async () => {
    await expect(as("anon", null, "select * from public.workspaces")).rejects.toThrow(/permission denied/);
    expect(await as("authenticated", null, "select * from public.workspaces")).toEqual([]);
  });

  it("browsers cannot write any table or call the write functions, even for their own garage", async () => {
    await expect(as("authenticated", A_USER, "update public.workspaces set doc = '{}'::jsonb where garage_id = $1", [garageA])).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", A_USER, `insert into public.memberships (user_id, garage_id, role) values ('${A_USER}', '${garageB}', 'owner')`)).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", A_USER, "select public.save_workspace($1, 1, '{}'::jsonb, 'x', $2)", [garageA, A_USER])).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", A_USER, "insert into public.issued_invoices (garage_id, id, number, snapshot, total_pence) values ($1, 'x', 'INV-9', '{}', 1)", [garageA])).rejects.toThrow(/permission denied/);
  });

  it("the write path refuses a user saving into another garage", async () => {
    const { doc, version } = await docOf(garageB);
    await expect(save(A_USER, garageB, version, doc)).rejects.toThrow(/forbidden/);
  });

  it("a workspace can't hold another garage's document", async () => {
    const { doc, version } = await docOf(garageA);
    const b = await docOf(garageB);
    await expect(save(A_USER, garageA, version, b.doc)).rejects.toThrow(/doc_is_this_garage/);
    expect((await docOf(garageA)).doc).toEqual(doc);
  });
});

describe("write path", () => {
  it("a stale save is refused (no lost update) and the newer one wins", async () => {
    const { doc, version } = await docOf(garageA);
    const [{ v }] = await save(A_USER, garageA, version, { ...doc, seq: 1 });
    expect(v).toBe(version + 1);
    await expect(save(A_USER, garageA, version, { ...doc, seq: 99 })).rejects.toThrow(/version_conflict/); // second tab / device
    expect((await docOf(garageA)).doc.seq).toBe(1);
    const audit = await as<{ op: string }>("authenticated", A_USER, "select op from public.audit_log");
    expect(audit.length).toBeGreaterThan(0);
    expect(await as("authenticated", B_USER, "select * from public.audit_log where garage_id = $1", [garageA])).toEqual([]);
  });

  it("the database refuses a second job for a quote or a second live invoice for a job", async () => {
    const { doc, version } = await docOf(garageA);
    const job = { id: "job_1", quoteId: "q_1", garageId: garageA };
    await expect(save(A_USER, garageA, version, { ...doc, jobs: [job, { ...job, id: "job_2" }] })).rejects.toThrow(/one_job_per_quote/);
    const inv = { id: "inv_1", jobId: "job_1", status: "draft" };
    await expect(save(A_USER, garageA, version, { ...doc, jobs: [job], invoices: [inv, { ...inv, id: "inv_2" }] })).rejects.toThrow(/one_invoice_per_job/);
    const [{ v }] = await save(A_USER, garageA, version, { ...doc, jobs: [job], invoices: [{ ...inv, status: "cancelled" }, { ...inv, id: "inv_2" }] });
    expect(v).toBe(version + 1); // a cancelled invoice plus its corrected draft is fine
  });

  it("issued invoices: numbers are unique per garage and the content is frozen", async () => {
    const a = await docOf(garageA);
    const issued = { id: "inv_2", jobId: "job_1", number: "INV-0001", amountPence: 12000, content: { notes: "" } };
    await save(A_USER, garageA, a.version, a.doc, issued);
    const again = await docOf(garageA);
    await expect(save(A_USER, garageA, again.version, again.doc, { ...issued, id: "inv_3" })).rejects.toThrow(/duplicate key/); // same number
    expect((await docOf(garageA)).version).toBe(again.version); // the whole save rolled back
    // The other garage may use the same number in its own series.
    const b = await docOf(garageB);
    await save(B_USER, garageB, b.version, b.doc, issued);

    await expect(as("service_role", null, "update public.issued_invoices set total_pence = 1 where garage_id = $1", [garageA])).rejects.toThrow(/cannot be changed/);
    await expect(as("service_role", null, "delete from public.issued_invoices where garage_id = $1", [garageA])).rejects.toThrow(/cannot be deleted/);
    await as("service_role", null, "update public.issued_invoices set pdf_path = 'x.pdf' where garage_id = $1", [garageA]); // only the PDF path may be set
    expect((await as<{ number: string }>("authenticated", B_USER, "select number from public.issued_invoices")).length).toBe(1);
  });
});

describe("SMS tables", () => {
  const claim = (garage: string, key: string, limit = 10, segments = 1) =>
    as<{ outcome: string; status: string }>("service_role", null, "select * from public.claim_sms_send($1, $2, 'msg_1', '+447700900101', '+447700900999', $3, $4)", [garage, key, segments, limit]);

  it("a send key is claimed once; repeats get the stored result", async () => {
    expect((await claim(garageA, "k1"))[0].outcome).toBe("claimed");
    expect((await claim(garageA, "k1"))[0]).toMatchObject({ outcome: "exists", status: "claimed" });
    await as("service_role", null, "select public.finish_sms_send($1, 'k1', 'accepted', 'SMaaa', 'queued', null)", [garageA]);
    expect((await claim(garageA, "k1"))[0]).toMatchObject({ outcome: "exists", status: "accepted" });
    expect((await claim(garageB, "k1"))[0].outcome).toBe("claimed"); // keys are per garage
  });

  it("enforces the rolling daily limit per garage", async () => {
    expect((await claim(garageB, "big", 10, 9))[0].outcome).toBe("claimed"); // 1 + 9 = 10 parts
    expect((await claim(garageB, "over", 10, 1))[0].outcome).toBe("limited");
  });

  it("delivery updates only move forward", async () => {
    const st = async () => (await as<{ provider_status: string }>("service_role", null, "select provider_status from public.sms_sends where provider_sid = 'SMaaa'"))[0].provider_status;
    await as("service_role", null, "select public.record_sms_status('SMaaa', 'delivered', null)");
    await as("service_role", null, "select public.record_sms_status('SMaaa', 'sent', null)"); // late
    expect(await st()).toBe("delivered");
    expect((await as<{ g: string }>("service_role", null, "select public.record_sms_status('SMaaa', 'failed', null) g"))[0].g).toBe(garageA);
    expect(await st()).toBe("delivered");
  });

  it("each garage sees only its own number and sends; numbers can't be shared; browsers can't write", async () => {
    await as("service_role", null, "insert into public.sms_numbers (garage_id, phone_e164, status) values ($1, '+447700900999', 'active')", [garageA]);
    await expect(as("service_role", null, "insert into public.sms_numbers (garage_id, phone_e164) values ($1, '+447700900999')", [garageB])).rejects.toThrow(/duplicate key/);
    expect(await as("authenticated", B_USER, "select * from public.sms_numbers")).toEqual([]);
    expect((await as<{ send_key: string }>("authenticated", B_USER, "select send_key from public.sms_sends")).map((r) => r.send_key).sort()).toEqual(["big", "k1"]);
    expect((await as<{ garage_id: string }>("authenticated", A_USER, "select garage_id from public.sms_sends")).every((r) => r.garage_id === garageA)).toBe(true);
    await expect(as("authenticated", A_USER, "update public.sms_numbers set phone_e164 = '+447700900111'")).rejects.toThrow(/permission denied/);
    await expect(as("authenticated", A_USER, "select * from public.claim_sms_send($1, 'x', 'm', '+447700900101', '+447700900999', 1, 10)", [garageA])).rejects.toThrow(/permission denied/);
  });
});

describe("platform admin access", () => {
  const ADMIN = "33333333-3333-3333-3333-333333333333";
  it("a platform admin can save into any garage; an ordinary outsider still can't", async () => {
    await db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'admin@example.com'); insert into public.platform_admins (user_id) values ('${ADMIN}');`);
    const { doc, version } = await docOf(garageB);
    const [{ v }] = await save(ADMIN, garageB, version, doc);
    expect(v).toBe(version + 1);
    await expect(save(A_USER, garageB, v, doc)).rejects.toThrow(/forbidden/);
    const log = await as<{ user_id: string }>("service_role", null, "select user_id from public.audit_log where garage_id = $1 order by id desc limit 1", [garageB]);
    expect(log[0].user_id).toBe(ADMIN); // recorded against the admin
    // Being an admin grants no direct table access from the browser.
    expect(await as("authenticated", ADMIN, "select * from public.workspaces")).toEqual([]);
  });
});

describe("invoice links", () => {
  it("the token is stored with the issued invoice, unique across garages, and can't be changed", async () => {
    const a = await docOf(garageA);
    const issued = { id: "inv_link1", jobId: "job_x", number: "INV-0100", amountPence: 5000, shareToken: "TOKENAAAAAAAAAAAAAAAAA" };
    await save(A_USER, garageA, a.version, a.doc, issued);
    const row = await as<{ share_token: string }>("service_role", null, "select share_token from public.issued_invoices where id = 'inv_link1'");
    expect(row[0].share_token).toBe("TOKENAAAAAAAAAAAAAAAAA");
    const b = await docOf(garageB);
    await expect(save(B_USER, garageB, b.version, b.doc, { ...issued, id: "inv_link2", number: "INV-0101" })).rejects.toThrow(/duplicate key/); // never shared by two invoices
    await expect(as("service_role", null, "update public.issued_invoices set share_token = 'OTHER' where id = 'inv_link1'")).rejects.toThrow(/cannot be changed/);
    // Browsers can't look tokens up: only the server resolves a link.
    expect(await as("authenticated", B_USER, "select share_token from public.issued_invoices where id = 'inv_link1'")).toEqual([]);
  });
});
