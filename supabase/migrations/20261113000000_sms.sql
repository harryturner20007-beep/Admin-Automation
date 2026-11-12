-- SMS: one sending number per garage, and a send ledger that makes every text go to the provider at most once.

-- The garage's sending number. Set by the platform admin only (the app server, after checking the number is
-- in the provider account and SMS-capable). The app resolves the sender from here, never from the browser.
create table public.sms_numbers (
  garage_id uuid primary key references public.garages (id) on delete cascade, -- one number per garage
  phone_e164 text not null unique check (phone_e164 ~ '^\+44[0-9]{10}$'),       -- one garage per number
  provider text not null default 'twilio' check (provider = 'twilio'),
  provider_sid text,
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- One row per text handed to the provider. The primary key is the message's send key, so a double-click,
-- a retry, a second browser tab or two overlapping workers can only ever claim it once.
create table public.sms_sends (
  garage_id uuid not null references public.garages (id) on delete cascade,
  send_key text not null,
  message_id text not null,
  to_phone text not null,
  from_phone text not null,
  segments integer not null default 1 check (segments between 1 and 10),
  is_test boolean not null default false,
  -- claimed: we're calling the provider; accepted / rejected: its answer; unknown: no clear answer (reconcile).
  status text not null default 'claimed' check (status in ('claimed', 'accepted', 'rejected', 'unknown')),
  provider_sid text unique,
  provider_status text,
  error text,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (garage_id, send_key)
);
create index sms_sends_recent on public.sms_sends (garage_id, claimed_at desc);

alter table public.sms_numbers enable row level security;
alter table public.sms_sends enable row level security;
create policy sms_numbers_read on public.sms_numbers for select to authenticated using (public.is_member(garage_id));
create policy sms_sends_read on public.sms_sends for select to authenticated using (public.is_member(garage_id));
revoke all on public.sms_numbers, public.sms_sends from anon;
revoke insert, update, delete, truncate on public.sms_numbers, public.sms_sends from authenticated;
grant select on public.sms_numbers, public.sms_sends to authenticated;

-- Claim a send. Returns 'claimed' (go ahead), 'exists' (already claimed: use the stored result) or 'limited'
-- (the garage's rolling 24-hour segment limit is used up). Serialised per garage so the limit can't be raced.
create function public.claim_sms_send(p_garage uuid, p_key text, p_message text, p_to text, p_from text, p_segments integer, p_daily_limit integer, p_is_test boolean default false)
returns table (outcome text, status text, provider_sid text, error text, claimed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('sms:' || p_garage::text));
  return query select 'exists'::text, s.status, s.provider_sid, s.error, s.claimed_at
    from public.sms_sends s where s.garage_id = p_garage and s.send_key = p_key;
  if found then return; end if;
  if (select coalesce(sum(s.segments), 0) from public.sms_sends s
      where s.garage_id = p_garage and s.claimed_at > now() - interval '24 hours' and s.status <> 'rejected') + p_segments > p_daily_limit then
    return query select 'limited'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  insert into public.sms_sends (garage_id, send_key, message_id, to_phone, from_phone, segments, is_test)
    values (p_garage, p_key, p_message, p_to, p_from, p_segments, p_is_test);
  return query select 'claimed'::text, 'claimed'::text, null::text, null::text, now();
end $$;

-- Record the provider's answer for a claimed send.
create function public.finish_sms_send(p_garage uuid, p_key text, p_status text, p_sid text, p_provider_status text, p_error text)
returns void language sql security definer set search_path = '' as $$
  update public.sms_sends set status = p_status, provider_sid = coalesce(p_sid, provider_sid),
    provider_status = coalesce(p_provider_status, provider_status), error = p_error, updated_at = now()
  where garage_id = p_garage and send_key = p_key and status = 'claimed';
$$;

revoke execute on function public.claim_sms_send(uuid, text, text, text, text, integer, integer, boolean) from public, anon, authenticated;
revoke execute on function public.finish_sms_send(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_sms_send(uuid, text, text, text, text, integer, integer, boolean) to service_role;
grant execute on function public.finish_sms_send(uuid, text, text, text, text, text) to service_role;

-- Record a delivery update from the provider. Only moves forward (queued → sent → delivered/undelivered/failed);
-- a late or repeated callback never overwrites a final result. Returns the garage the text belongs to.
create function public.record_sms_status(p_sid text, p_status text, p_error text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare g uuid;
begin
  update public.sms_sends s set provider_status = p_status, error = coalesce(p_error, s.error), updated_at = now()
    where s.provider_sid = p_sid
      and (case p_status when 'delivered' then 4 when 'undelivered' then 4 when 'failed' then 4 when 'canceled' then 4 when 'sent' then 3 when 'sending' then 2 else 1 end)
        > (case coalesce(s.provider_status, '') when 'delivered' then 4 when 'undelivered' then 4 when 'failed' then 4 when 'canceled' then 4 when 'sent' then 3 when 'sending' then 2 when '' then 0 else 1 end);
  select s.garage_id into g from public.sms_sends s where s.provider_sid = p_sid;
  return g;
end $$;
revoke execute on function public.record_sms_status(text, text, text) from public, anon, authenticated;
grant execute on function public.record_sms_status(text, text, text) to service_role;
