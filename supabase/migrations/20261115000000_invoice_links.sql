-- Invoice links: each issued invoice gets a random, unguessable token. The customer is texted
-- https://<site>/i/<token>, which opens the invoice PDF without a login. Anyone holding the link can open that
-- one invoice and nothing else; the token is 128 random bits and is never derived from anything else.
alter table public.issued_invoices add column share_token text unique;

-- Frozen like the rest of the issued invoice: once set it can't change (only the PDF path may).
create or replace function public.issued_invoices_frozen() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'issued invoices cannot be deleted' using errcode = '42501';
  end if;
  if (new.garage_id, new.id, new.job_id, new.number, new.snapshot, new.total_pence, new.issued_by, new.issued_at, new.share_token)
     is distinct from (old.garage_id, old.id, old.job_id, old.number, old.snapshot, old.total_pence, old.issued_by, old.issued_at, old.share_token) then
    raise exception 'issued invoices cannot be changed' using errcode = '42501';
  end if;
  return new; -- only pdf_path may be set
end $$;

-- Same save path as before, now storing the invoice's share token with the frozen copy.
create or replace function public.save_workspace(p_garage uuid, p_version integer, p_doc jsonb, p_op text, p_user uuid, p_issued jsonb default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  if p_user is not null
     and not exists (select 1 from public.memberships m where m.garage_id = p_garage and m.user_id = p_user)
     and not exists (select 1 from public.platform_admins a where a.user_id = p_user) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.workspaces w set doc = p_doc, version = w.version + 1, updated_at = now(), updated_by = p_user
    where w.garage_id = p_garage and w.version = p_version
    returning w.version into v;
  if v is null then
    raise exception 'version_conflict' using errcode = '40001';
  end if;
  if p_issued is not null then
    insert into public.issued_invoices (garage_id, id, job_id, number, snapshot, total_pence, issued_by, share_token)
      values (p_garage, p_issued ->> 'id', p_issued ->> 'jobId', p_issued ->> 'number', p_issued, (p_issued ->> 'amountPence')::integer, p_user, p_issued ->> 'shareToken');
  end if;
  insert into public.audit_log (garage_id, user_id, op, version) values (p_garage, p_user, left(p_op, 120), v);
  return v;
end $$;
