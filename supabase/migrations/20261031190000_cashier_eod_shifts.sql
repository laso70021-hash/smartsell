-- Cashier shifts are tenant- and branch-scoped; each cashier may have one open shift.
alter table public.smartsell_businesses
  alter column currency set default 'TZS';

create table if not exists public.smartsell_cashier_shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.smartsell_businesses(id) on delete cascade,
  branch_id uuid not null,
  cashier_id uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  opening_cash bigint not null check (opening_cash >= 0),
  closed_at timestamptz,
  expected_cash bigint,
  counted_cash bigint,
  variance bigint,
  sales_count integer,
  sales_total bigint,
  report jsonb,
  foreign key (branch_id, business_id)
    references public.smartsell_branches(id, business_id),
  check (
    (closed_at is null and expected_cash is null and counted_cash is null and report is null)
    or (closed_at is not null and expected_cash is not null and counted_cash is not null and report is not null)
  )
);

create unique index if not exists smartsell_cashier_shifts_one_open_idx
  on public.smartsell_cashier_shifts (cashier_id)
  where closed_at is null;
create index if not exists smartsell_cashier_shifts_report_idx
  on public.smartsell_cashier_shifts (business_id, branch_id, closed_at desc)
  where closed_at is not null;

alter table public.smartsell_cashier_shifts enable row level security;
revoke all on public.smartsell_cashier_shifts from anon, authenticated;

alter table public.smartsell_sales
  add column if not exists shift_id uuid
  references public.smartsell_cashier_shifts(id);
create index if not exists smartsell_sales_shift_idx
  on public.smartsell_sales (shift_id, created_at)
  where shift_id is not null;

create or replace function private.ss_attach_cashier_shift()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_role text;
  active_shift public.smartsell_cashier_shifts;
begin
  select role into member_role
    from public.smartsell_members
   where id = new.actor_id and business_id = new.business_id;

  if member_role = 'cashier' then
    select * into active_shift
      from public.smartsell_cashier_shifts
     where business_id = new.business_id
       and branch_id = new.branch_id
       and cashier_id = new.actor_id
       and closed_at is null
     for update;
    perform private.ss_assert(found, 'Open a cashier shift before completing a sale');
    new.shift_id := active_shift.id;
  else
    new.shift_id := null;
  end if;
  return new;
end
$$;

revoke all on function private.ss_attach_cashier_shift() from public, anon, authenticated;
create trigger smartsell_sales_attach_cashier_shift
  before insert on public.smartsell_sales
  for each row execute function private.ss_attach_cashier_shift();

create or replace function private.smartsell_cashier_shifts(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  m public.smartsell_members := private.ss_member();
  action text := command->>'action';
  branch_id uuid := coalesce(nullif(command->>'branch_id', '')::uuid, m.branch_id);
  cashier_id uuid := nullif(command->>'cashier_id', '')::uuid;
  shift public.smartsell_cashier_shifts;
  opening_amount bigint;
  counted_amount bigint;
  expected_amount bigint;
  completed_sales integer;
  completed_total bigint;
  variance_amount bigint;
  report_data jsonb;
begin
  if action = 'active' then
    perform private.ss_assert(m.role = 'cashier', 'Cashier role required');
    perform private.ss_branch(m, branch_id);
    select * into shift
      from public.smartsell_cashier_shifts s
     where s.business_id = m.business_id
       and s.cashier_id = m.id
       and s.branch_id = branch_id
       and s.closed_at is null;
    return jsonb_build_object(
      'shift', case when found then to_jsonb(shift) else null end
    );
  elsif action = 'open' then
    perform private.ss_assert(m.role = 'cashier', 'Cashier role required');
    perform private.ss_branch(m, branch_id);
    opening_amount := private.ss_int(command, 'opening_cash', 0, 1000000000);
    perform pg_advisory_xact_lock(hashtextextended(m.id::text || ':cashier-shift', 0));
    perform private.ss_assert(
      not exists (
        select 1 from public.smartsell_cashier_shifts s
         where s.cashier_id = m.id and s.closed_at is null
      ),
      'You already have an open shift'
    );
    insert into public.smartsell_cashier_shifts
      (business_id, branch_id, cashier_id, opening_cash)
    values
      (m.business_id, branch_id, m.id, opening_amount)
    returning * into shift;
    return jsonb_build_object('shift', to_jsonb(shift));
  elsif action = 'close' then
    perform private.ss_assert(m.role = 'cashier', 'Cashier role required');
    counted_amount := private.ss_int(command, 'counted_cash', 0, 1000000000);
    perform pg_advisory_xact_lock(hashtextextended(m.id::text || ':cashier-shift', 0));
    select * into shift
      from public.smartsell_cashier_shifts s
     where s.business_id = m.business_id
       and s.cashier_id = m.id
       and s.closed_at is null
     for update;
    perform private.ss_assert(found, 'Open a shift before submitting a reconciliation');

    select count(*)::integer, coalesce(sum(s.total), 0)::bigint,
           shift.opening_cash + coalesce(sum(s.paid) filter (where s.method = 'cash'), 0)::bigint
      into completed_sales, completed_total, expected_amount
      from public.smartsell_sales s
     where s.shift_id = shift.id and s.status = 'completed';

    select jsonb_build_object(
      'sales', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'reference', s.reference,
            'created_at', s.created_at,
            'total', s.total,
            'paid', s.paid,
            'method', s.method,
            'items', coalesce((
              select jsonb_agg(jsonb_build_object(
                'product_id', i.product_id,
                'name', i.name,
                'sku', i.sku,
                'quantity', i.quantity,
                'price', i.price
              ) order by i.name)
                from public.smartsell_sale_items i
               where i.sale_id = s.id
            ), '[]'::jsonb)
          ) order by s.created_at
        )
          from public.smartsell_sales s
         where s.shift_id = shift.id and s.status = 'completed'
      ), '[]'::jsonb),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', sold.product_id,
          'product_id', sold.product_id,
          'name', sold.name,
          'sku', sold.sku,
          'quantity', sold.quantity,
          'total', sold.total
        ) order by sold.name)
          from (
            select i.product_id, i.name, i.sku,
                   sum(i.quantity)::bigint quantity,
                   sum(i.price * i.quantity)::bigint total
              from public.smartsell_sale_items i
              join public.smartsell_sales s on s.id = i.sale_id
             where s.shift_id = shift.id and s.status = 'completed'
             group by i.product_id, i.name, i.sku
          ) sold
      ), '[]'::jsonb)
    ) into report_data;

    variance_amount := counted_amount - expected_amount;
    update public.smartsell_cashier_shifts
       set closed_at = now(),
           expected_cash = expected_amount,
           counted_cash = counted_amount,
           variance = variance_amount,
           sales_count = completed_sales,
           sales_total = completed_total,
           report = report_data
     where id = shift.id
    returning * into shift;
    return jsonb_build_object('shift', to_jsonb(shift) || jsonb_build_object('cashier', m.name));
  elsif action = 'list' then
    perform private.ss_assert(m.role in ('owner', 'manager'), 'Manager permission required');
    perform private.ss_branch(m, branch_id);
    if cashier_id is not null then
      perform private.ss_assert(
        exists (
          select 1 from public.smartsell_members
           where id = cashier_id
             and business_id = m.business_id
             and role = 'cashier'
        ),
        'Cashier not found'
      );
    end if;
    return jsonb_build_object(
      'shifts', coalesce((
        select jsonb_agg(
          to_jsonb(s) || jsonb_build_object('cashier', cashier.name)
          order by s.closed_at desc
        )
          from public.smartsell_cashier_shifts s
          join public.smartsell_members cashier on cashier.id = s.cashier_id
          join public.smartsell_businesses business on business.id = s.business_id
         where s.business_id = m.business_id
           and s.branch_id = branch_id
           and s.closed_at is not null
           and (cashier_id is null or s.cashier_id = cashier_id)
           and (nullif(command->>'from', '') is null
             or (s.closed_at at time zone business.timezone)::date >= (command->>'from')::date)
           and (nullif(command->>'to', '') is null
             or (s.closed_at at time zone business.timezone)::date <= (command->>'to')::date)
      ), '[]'::jsonb)
    );
  end if;

  raise exception 'Unsupported cashier shift action: %', action;
end
$$;

create or replace function public.smartsell_cashier_shifts(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.smartsell_cashier_shifts(command); $$;

revoke all on function private.smartsell_cashier_shifts(jsonb) from public, anon, authenticated;
revoke all on function public.smartsell_cashier_shifts(jsonb) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.smartsell_cashier_shifts(jsonb) to authenticated;
grant execute on function public.smartsell_cashier_shifts(jsonb) to authenticated;

create or replace function private.smartsell_update_business(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.smartsell_members := private.ss_member();
  saved public.smartsell_businesses;
begin
  perform private.ss_assert(m.role = 'owner', 'Owner permission required');
  perform private.ss_assert(
    exists (select 1 from pg_timezone_names where name = command->>'timezone'),
    'Invalid timezone'
  );
  perform private.ss_assert(
    command->>'currency' ~ '^[A-Z]{3}$',
    'Currency must be a three-letter ISO code'
  );

  update public.smartsell_businesses
     set name = private.ss_text(command, 'name'),
         currency = command->>'currency',
         country = private.ss_text(command, 'country'),
         timezone = command->>'timezone',
         email = private.ss_text(command, 'email', false),
         phone = private.ss_text(command, 'phone', false),
         address = private.ss_text(command, 'address', false),
         tax_id = private.ss_text(command, 'tax_id', false)
   where id = m.business_id
  returning * into saved;

  perform private.ss_event(
    m,
    null,
    'Business',
    saved.name,
    'Business profile updated',
    saved.id::text
  );
  return to_jsonb(saved);
end
$$;

create or replace function public.smartsell_update_business(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.smartsell_update_business(command); $$;

revoke all on function private.smartsell_update_business(jsonb) from public, anon, authenticated;
revoke all on function public.smartsell_update_business(jsonb) from public, anon, authenticated;
grant execute on function private.smartsell_update_business(jsonb) to authenticated;
grant execute on function public.smartsell_update_business(jsonb) to authenticated;
