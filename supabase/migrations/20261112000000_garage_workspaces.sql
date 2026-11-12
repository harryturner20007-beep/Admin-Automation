-- Garage workspaces: one private workspace per garage, members linked by Supabase Auth user id.
--
-- Access model
--   Reads:  signed-in members read their own garage's rows through row-level security (RLS).
--   Writes: only the app server (service role) writes, after checking the user's session. Every write goes
--           through save_workspace(), which re-checks membership in the database, enforces the version
--           (optimistic locking: a stale save fails instead of overwriting), and records an audit row.
--   Browsers never get write access to any table, so a tampered client can only call the app's server
--   actions, which validate every change.

-- ---------- tables ----------

create table public.garages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.memberships (
  user_id uuid not null references auth.users (id) on delete cascade,
  garage_id uuid not null references public.garages (id) on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  display_name text not null default '' check (length(display_name) <= 80),
  created_at timestamptz not null default now(),
  primary key (user_id, garage_id)
);
create index memberships_garage on public.memberships (garage_id);

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- One job per quote and one live (not cancelled) invoice per job, checked on every write of the document.
create function public.jobs_unique_per_quote(doc jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select count(*) = count(distinct j ->> 'quoteId') from jsonb_array_elements(coalesce(doc -> 'jobs', '[]'::jsonb)) j
$$;

create function public.invoices_unique_per_job(doc jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select count(*) = count(distinct i ->> 'jobId')
  from jsonb_array_elements(coalesce(doc -> 'invoices', '[]'::jsonb)) i
  where i ->> 'jobId' is not null and i ->> 'status' <> 'cancelled'
$$;

-- The garage's records (quotes, jobs, invoices, texts, tasks, history, settings) as one document.
-- shortcut: the whole document is written on each save; fine to a few MB (a small garage's several years).
-- Upgrade to per-record tables if a garage's document passes ~5 MB.
create table public.workspaces (
  garage_id uuid primary key references public.garages (id) on delete cascade,
  doc jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint doc_is_this_garage check (doc -> 'garages' -> 0 ->> 'id' = garage_id::text and jsonb_array_length(doc -> 'garages') = 1),
  constraint one_job_per_quote check (public.jobs_unique_per_quote(doc)),
  constraint one_invoice_per_job check (public.invoices_unique_per_job(doc))
);

-- Issued invoices, frozen at issue. Numbers are unique per garage; the content can never change.
create table public.issued_invoices (
  garage_id uuid not null references public.garages (id) on delete restrict,
  id text not null,
  job_id text,
  number text not null,
  snapshot jsonb not null,
  total_pence integer not null check (total_pence >= 0),
  issued_by uuid,
  issued_at timestamptz not null default now(),
  pdf_path text,
  primary key (garage_id, id),
  unique (garage_id, number)
);

create function public.issued_invoices_frozen() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'issued invoices cannot be deleted' using errcode = '42501';
  end if;
  if (new.garage_id, new.id, new.job_id, new.number, new.snapshot, new.total_pence, new.issued_by, new.issued_at)
     is distinct from (old.garage_id, old.id, old.job_id, old.number, old.snapshot, old.total_pence, old.issued_by, old.issued_at) then
    raise exception 'issued invoices cannot be changed' using errcode = '42501';
  end if;
  return new; -- only pdf_path may be set
end $$;
create trigger issued_invoices_frozen before update or delete on public.issued_invoices
  for each row execute function public.issued_invoices_frozen();

create table public.audit_log (
  id bigint generated always as identity primary key,
  garage_id uuid not null references public.garages (id) on delete cascade,
  user_id uuid,
  op text not null,
  version integer not null,
  at timestamptz not null default now()
);
create index audit_log_garage on public.audit_log (garage_id, at desc);

-- ---------- access helpers ----------

create function public.is_member(g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.garage_id = g and m.user_id = (select auth.uid()))
$$;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))
$$;

-- ---------- row-level security: members read their own garage, nobody writes from the browser ----------

alter table public.garages enable row level security;
alter table public.memberships enable row level security;
alter table public.platform_admins enable row level security;
alter table public.workspaces enable row level security;
alter table public.issued_invoices enable row level security;
alter table public.audit_log enable row level security;

create policy garages_read on public.garages for select to authenticated using (public.is_member(id));
create policy memberships_read on public.memberships for select to authenticated using (user_id = (select auth.uid()) or public.is_member(garage_id));
create policy admins_read_self on public.platform_admins for select to authenticated using (user_id = (select auth.uid()));
create policy workspaces_read on public.workspaces for select to authenticated using (public.is_member(garage_id));
create policy issued_read on public.issued_invoices for select to authenticated using (public.is_member(garage_id));
create policy audit_read on public.audit_log for select to authenticated using (public.is_member(garage_id));

revoke all on public.garages, public.memberships, public.platform_admins, public.workspaces, public.issued_invoices, public.audit_log from anon;
revoke insert, update, delete, truncate on public.garages, public.memberships, public.platform_admins, public.workspaces, public.issued_invoices, public.audit_log from authenticated;
grant select on public.garages, public.memberships, public.platform_admins, public.workspaces, public.issued_invoices, public.audit_log to authenticated;

-- ---------- the one write path ----------

-- Save a workspace if nobody else saved since `p_version`. p_user is the signed-in member (null for the
-- reminder scheduler). p_issued, when given, is the invoice being issued in this same save.
create function public.save_workspace(p_garage uuid, p_version integer, p_doc jsonb, p_op text, p_user uuid, p_issued jsonb default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  if p_user is not null and not exists (select 1 from public.memberships m where m.garage_id = p_garage and m.user_id = p_user) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.workspaces w set doc = p_doc, version = w.version + 1, updated_at = now(), updated_by = p_user
    where w.garage_id = p_garage and w.version = p_version
    returning w.version into v;
  if v is null then
    raise exception 'version_conflict' using errcode = '40001';
  end if;
  if p_issued is not null then
    insert into public.issued_invoices (garage_id, id, job_id, number, snapshot, total_pence, issued_by)
      values (p_garage, p_issued ->> 'id', p_issued ->> 'jobId', p_issued ->> 'number', p_issued, (p_issued ->> 'amountPence')::integer, p_user);
  end if;
  insert into public.audit_log (garage_id, user_id, op, version) values (p_garage, p_user, left(p_op, 120), v);
  return v;
end $$;

-- Create a garage with its first workspace document (platform admin, through the app server).
create function public.create_garage(p_name text, p_doc_template jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare g uuid;
begin
  insert into public.garages (name) values (p_name) returning id into g;
  insert into public.workspaces (garage_id, doc)
    values (g, jsonb_set(p_doc_template, '{garages,0,id}', to_jsonb(g::text)));
  return g;
end $$;

revoke execute on function public.save_workspace(uuid, integer, jsonb, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.create_garage(text, jsonb) from public, anon, authenticated;
grant execute on function public.save_workspace(uuid, integer, jsonb, text, uuid, jsonb) to service_role;
grant execute on function public.create_garage(text, jsonb) to service_role;

-- ---------- private file storage (invoice PDFs, logos) ----------
-- Paths start with the garage id: "<garage_id>/invoices/<invoice_id>.pdf", "<garage_id>/logo".

insert into storage.buckets (id, name, public) values ('garage-files', 'garage-files', false)
  on conflict (id) do nothing;

create policy garage_files_read on storage.objects for select to authenticated
  using (bucket_id = 'garage-files' and public.is_member(((storage.foldername(name))[1])::uuid));
