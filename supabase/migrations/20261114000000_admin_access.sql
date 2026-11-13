-- Platform admins can save into any garage's workspace (support and setup). Everyone else still has to be a
-- member of that garage. The admin's user id is recorded in the audit log like any other save.
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
    insert into public.issued_invoices (garage_id, id, job_id, number, snapshot, total_pence, issued_by)
      values (p_garage, p_issued ->> 'id', p_issued ->> 'jobId', p_issued ->> 'number', p_issued, (p_issued ->> 'amountPence')::integer, p_user);
  end if;
  insert into public.audit_log (garage_id, user_id, op, version) values (p_garage, p_user, left(p_op, 120), v);
  return v;
end $$;
