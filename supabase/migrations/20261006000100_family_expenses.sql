-- Run as the migration owner (postgres), never as a browser client.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  email text not null check (email = lower(btrim(email)) and email like '%@%'),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint members_email_key unique (email)
);

create table public.expense_tabs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  created_by uuid not null references public.members(id),
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.expense_tabs(id),
  description text not null check (length(btrim(description)) > 0),
  total_cents bigint not null check (total_cents between 0 and 9007199254740991),
  currency text not null check (currency in ('USD', 'MXN')),
  paid_by uuid not null references public.members(id),
  created_by uuid not null references public.members(id),
  split_mode text not null default 'equal' check (split_mode in ('equal', 'custom', 'percentage')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expense_shares (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid not null references public.members(id),
  amount_cents bigint not null check (amount_cents between 0 and 9007199254740991),
  percentage numeric check (percentage between 0 and 100),
  payor_marked_paid boolean not null default false,
  payee_confirmed boolean not null default false,
  status text generated always as (
    case when not payor_marked_paid then 'to-be-paid'
      when not payee_confirmed then 'awaiting-confirmation'
      else 'settled' end
  ) stored,
  constraint expense_shares_member_key unique (expense_id, member_id),
  constraint confirmation_requires_payment check (not payee_confirmed or payor_marked_paid)
);

create index expenses_tab_id_idx on public.expenses(tab_id);
create index expenses_paid_by_idx on public.expenses(paid_by);
create index expenses_created_by_idx on public.expenses(created_by);
create index expense_shares_member_id_idx on public.expense_shares(member_id);
create index expense_tabs_created_by_idx on public.expense_tabs(created_by);

alter table public.members enable row level security;
alter table public.expense_tabs enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;

-- A definer avoids recursive members-table RLS. It has no caller-supplied identity.
create function private.current_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.members m where m.auth_user_id = (select auth.uid())
$$;

create policy members_read on public.members for select to authenticated
  using ((select private.current_member_id()) is not null);
create policy tabs_read on public.expense_tabs for select to authenticated
  using ((select private.current_member_id()) is not null);
create policy expenses_read on public.expenses for select to authenticated
  using ((select private.current_member_id()) is not null);
create policy shares_read on public.expense_shares for select to authenticated
  using ((select private.current_member_id()) is not null);

-- All writes go through checked RPCs; no client can change a confirmation flag,
-- member allowlist, expense creator, or split row directly.
revoke all on public.members, public.expense_tabs, public.expenses, public.expense_shares
  from public, anon, authenticated;
grant select on public.members, public.expense_tabs, public.expenses, public.expense_shares
  to authenticated;

create function private.require_member() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare member_id uuid;
begin
  member_id := private.current_member_id();
  if member_id is null then raise exception 'Access denied' using errcode = '42501'; end if;
  return member_id;
end;
$$;

-- This is the sole pre-membership exception, required to link on first login.
-- Trust auth.users verified email, never user_metadata or a submitted email/ID.
create function public.link_current_member() returns uuid
language plpgsql security definer set search_path = '' as $$
declare user_id uuid := auth.uid(); verified_email text; member_id uuid;
begin
  select lower(btrim(u.email)) into verified_email from auth.users u
    where u.id = user_id and u.email_confirmed_at is not null;
  if verified_email is null then raise exception 'Access denied' using errcode = '42501'; end if;
  update public.members m set auth_user_id = user_id
    where m.email = verified_email and (m.auth_user_id is null or m.auth_user_id = user_id)
    returning m.id into member_id;
  if member_id is null then raise exception 'Access denied' using errcode = '42501'; end if;
  return member_id;
end;
$$;

create function public.create_expense_tab(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare member_id uuid := private.require_member(); tab_id uuid;
begin
  insert into public.expense_tabs(name, created_by) values (btrim(p_name), member_id)
    returning id into tab_id;
  return tab_id;
end;
$$;

-- Allocate authoritative shares on the server, matching the Phase 1 algorithms.
-- Input: [{"member_id":"uuid"}] for equal; add amount_cents for custom,
-- or percentage (decimal string) for percentage mode. Ignore client flags.
create function private.allocate_shares(p_total bigint, p_paid_by uuid, p_mode text, p_shares jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare participant_count integer; payee_present boolean; result jsonb;
begin
  if p_total is null or p_total < 0 or p_total > 9007199254740991
    or p_paid_by is null or p_mode is null or p_mode not in ('equal', 'custom', 'percentage') then
    raise exception 'Invalid expense';
  end if;
  if p_shares is null or jsonb_typeof(p_shares) <> 'array' then raise exception 'Participants must be an array'; end if;
  participant_count := jsonb_array_length(p_shares);
  if participant_count = 0 then raise exception 'Select at least one participant'; end if;
  if exists (select 1 from jsonb_array_elements(p_shares) item where jsonb_typeof(item) <> 'object' or item->>'member_id' is null) then
    raise exception 'Invalid participant';
  end if;
  if (select count(distinct (item->>'member_id')::uuid) from jsonb_array_elements(p_shares) item) <> participant_count then
    raise exception 'Duplicate member';
  end if;
  if not exists (select 1 from public.members where id = p_paid_by)
    or exists (select 1 from jsonb_array_elements(p_shares) item where not exists
      (select 1 from public.members m where m.id = (item->>'member_id')::uuid)) then
    raise exception 'Unknown member';
  end if;
  payee_present := exists (select 1 from jsonb_array_elements(p_shares) item where (item->>'member_id')::uuid = p_paid_by);

  if p_mode = 'equal' then
    select jsonb_agg(jsonb_build_object('member_id', id, 'amount_cents',
      p_total / participant_count + case when payee_present then case when id = p_paid_by then p_total % participant_count else 0 end
        else case when ordinal <= p_total % participant_count then 1 else 0 end end,
      'percentage', null) order by id)
    into result from (
      select (item->>'member_id')::uuid id, row_number() over (order by (item->>'member_id')::uuid) ordinal
      from jsonb_array_elements(p_shares) item
    ) participants;
  elsif p_mode = 'custom' then
    if exists (select 1 from jsonb_array_elements(p_shares) item where item->>'amount_cents' is null
      or item->>'amount_cents' !~ '^[0-9]+$'
      or (item->>'amount_cents')::numeric > 9007199254740991) then
      raise exception 'Invalid custom amount';
    end if;
    if (select sum((item->>'amount_cents')::numeric) from jsonb_array_elements(p_shares) item) <> p_total then
      raise exception 'Custom amounts must sum to the total';
    end if;
    select jsonb_agg(jsonb_build_object('member_id', (item->>'member_id')::uuid,
      'amount_cents', (item->>'amount_cents')::bigint, 'percentage', null) order by (item->>'member_id')::uuid)
      into result from jsonb_array_elements(p_shares) item;
  else
    if exists (select 1 from jsonb_array_elements(p_shares) item where item->>'percentage' is null
      or btrim(item->>'percentage') !~ '^[0-9]+(\.[0-9]+)?$'
      or (item->>'percentage')::numeric > 100) then raise exception 'Invalid percentage'; end if;
    if (select sum((item->>'percentage')::numeric) from jsonb_array_elements(p_shares) item) <> 100 then
      raise exception 'Percentages must sum to 100';
    end if;
    -- div/mod use exact NUMERIC arithmetic; ordinary division could round.
    with raw as (
      select (item->>'member_id')::uuid id, (item->>'percentage')::numeric percentage,
        div(p_total::numeric * (item->>'percentage')::numeric, 100) base,
        mod(p_total::numeric * (item->>'percentage')::numeric, 100) remainder
      from jsonb_array_elements(p_shares) item
    ), ranked as (
      select *, row_number() over (order by remainder desc, id) ordinal,
        p_total - sum(base) over () leftover from raw
    )
    select jsonb_agg(jsonb_build_object('member_id', id,
      'amount_cents', (base + case when ordinal <= leftover then 1 else 0 end)::bigint,
      'percentage', percentage) order by id) into result from ranked;
  end if;
  return result;
end;
$$;

create function public.save_expense(
  p_tab_id uuid, p_description text, p_total_cents bigint, p_currency text,
  p_paid_by uuid, p_split_mode text, p_shares jsonb, p_expense_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_member(); previous public.expenses%rowtype;
  allocated jsonb; existing jsonb; expense_id uuid; reset_shares boolean := true;
begin
  if p_expense_id is not null then
    select * into previous from public.expenses where id = p_expense_id for update;
    if not found or (actor <> previous.created_by and actor <> previous.paid_by) then
      raise exception 'Access denied' using errcode = '42501';
    end if;
  end if;
  allocated := private.allocate_shares(p_total_cents, p_paid_by, p_split_mode, p_shares);
  if p_expense_id is null then
    insert into public.expenses(tab_id, description, total_cents, currency, paid_by, created_by, split_mode)
      values (p_tab_id, btrim(p_description), p_total_cents, p_currency, p_paid_by, actor, p_split_mode)
      returning id into expense_id;
  else
    expense_id := previous.id;
    select jsonb_agg(jsonb_build_object('member_id', member_id, 'amount_cents', amount_cents,
      'percentage', percentage) order by member_id) into existing from public.expense_shares where expense_shares.expense_id = previous.id;
    reset_shares := previous.total_cents is distinct from p_total_cents
      or previous.currency is distinct from p_currency or previous.paid_by is distinct from p_paid_by
      or previous.split_mode is distinct from p_split_mode or existing is distinct from allocated;
    update public.expenses set tab_id = p_tab_id, description = btrim(p_description), total_cents = p_total_cents,
      currency = p_currency, paid_by = p_paid_by, split_mode = p_split_mode, updated_at = now() where id = previous.id;
    if reset_shares then delete from public.expense_shares where expense_shares.expense_id = previous.id; end if;
  end if;
  if reset_shares then
    insert into public.expense_shares(expense_id, member_id, amount_cents, percentage, payor_marked_paid, payee_confirmed)
      select expense_id, (item->>'member_id')::uuid, (item->>'amount_cents')::bigint,
        (item->>'percentage')::numeric, (item->>'member_id')::uuid = p_paid_by,
        (item->>'member_id')::uuid = p_paid_by from jsonb_array_elements(allocated) item;
  end if;
  return expense_id;
end;
$$;

create function public.delete_expense(p_expense_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_member(); expense public.expenses%rowtype;
begin
  select * into expense from public.expenses where id = p_expense_id for update;
  if not found or (actor <> expense.created_by and actor <> expense.paid_by) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  delete from public.expenses where id = expense.id;
end;
$$;

create function public.mark_paid(share_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_member(); target_expense uuid; item public.expense_shares%rowtype;
begin
  select expense_id into target_expense from public.expense_shares where id = share_id;
  -- All payment/edit/delete RPCs lock the expense before touching its shares.
  perform 1 from public.expenses where id = target_expense for update;
  select * into item from public.expense_shares where id = share_id for update;
  if not found or item.member_id <> actor then raise exception 'Access denied' using errcode = '42501'; end if;
  update public.expense_shares set payor_marked_paid = true where id = item.id;
end;
$$;

create function public.confirm_received(share_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_member(); target_expense uuid; payee uuid; item public.expense_shares%rowtype;
begin
  select expense_id into target_expense from public.expense_shares where id = share_id;
  select paid_by into payee from public.expenses where id = target_expense for update;
  select * into item from public.expense_shares where id = share_id for update;
  if not found or payee is null or payee <> actor then raise exception 'Access denied' using errcode = '42501'; end if;
  if not item.payor_marked_paid then raise exception 'Payment has not been marked'; end if;
  update public.expense_shares set payee_confirmed = true where id = item.id;
end;
$$;

-- Deferred integrity guards also protect admin imports: complete share set, exact
-- total, matching mode, and own share settled. Cascade deletion is allowed.
create function private.check_expense_integrity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target uuid; expense public.expenses%rowtype; participant_count bigint; sum_cents numeric; percent_sum numeric;
begin
  if tg_table_name = 'expenses' then
    if tg_op = 'DELETE' then target := old.id; else target := new.id; end if;
  else
    if tg_op = 'DELETE' then target := old.expense_id; else target := new.expense_id; end if;
    if tg_op = 'UPDATE' and old.expense_id <> new.expense_id then
      raise exception 'Share expense ID is immutable';
    end if;
  end if;
  select * into expense from public.expenses where id = target;
  if not found then return null; end if;
  select count(*), sum(amount_cents), sum(percentage) into participant_count, sum_cents, percent_sum
    from public.expense_shares where expense_id = target;
  if participant_count = 0 or sum_cents <> expense.total_cents then raise exception 'Shares must sum to expense total'; end if;
  if exists (select 1 from public.expense_shares where expense_id = target
    and member_id = expense.paid_by and not (payor_marked_paid and payee_confirmed)) then
    raise exception 'Payee own share must be settled';
  end if;
  if (expense.split_mode = 'percentage' and (percent_sum is distinct from 100::numeric
    or exists (select 1 from public.expense_shares where expense_id = target and percentage is null)))
    or (expense.split_mode <> 'percentage' and exists (select 1 from public.expense_shares where expense_id = target and percentage is not null)) then
    raise exception 'Invalid split percentages';
  end if;
  return null;
end;
$$;

create constraint trigger expenses_integrity after insert or update or delete on public.expenses
  deferrable initially deferred for each row execute function private.check_expense_integrity();
create constraint trigger shares_integrity after insert or update or delete on public.expense_shares
  deferrable initially deferred for each row execute function private.check_expense_integrity();

-- PostgreSQL grants new functions to PUBLIC by default: explicitly close them.
revoke all on function private.current_member_id(), private.require_member(),
  private.allocate_shares(bigint, uuid, text, jsonb), private.check_expense_integrity()
  from public, anon, authenticated;
grant execute on function private.current_member_id() to authenticated;
revoke all on function public.link_current_member(), public.create_expense_tab(text),
  public.save_expense(uuid, text, bigint, text, uuid, text, jsonb, uuid),
  public.delete_expense(uuid), public.mark_paid(uuid), public.confirm_received(uuid)
  from public, anon, authenticated;
grant execute on function public.link_current_member(), public.create_expense_tab(text),
  public.save_expense(uuid, text, bigint, text, uuid, text, jsonb, uuid),
  public.delete_expense(uuid), public.mark_paid(uuid), public.confirm_received(uuid)
  to authenticated;

commit;
