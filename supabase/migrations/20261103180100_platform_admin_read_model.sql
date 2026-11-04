create table private.smartsell_platform_admins (
  user_id uuid primary key,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

revoke all on table private.smartsell_platform_admins from public, anon, authenticated;

insert into private.smartsell_platform_admins (user_id)
values ('0706ee20-d730-4a3e-bfaf-db0547cb3da5'::uuid)
on conflict (user_id) do nothing;

create or replace function private.smartsell_platform_admin(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := auth.uid();
  requested_action text := coalesce(command->>'action', 'overview');
  requested_range text := coalesce(command->>'range', '30d');
  range_start timestamptz;
  target_user_id uuid;
  target_member public.smartsell_members;
  next_active integer;
  result jsonb;
begin
  if admin_id is null or not exists (
    select 1
    from private.smartsell_platform_admins a
    where a.user_id = admin_id and a.active
  ) then
    raise exception 'Platform admin access required'
      using errcode = '42501';
  end if;

  if requested_action not in ('overview', 'businesses', 'users', 'branches', 'toggle_user') then
    raise exception 'Unsupported platform admin action'
      using errcode = '22023';
  end if;

  if requested_action = 'toggle_user' then
    target_user_id := nullif(command->>'user_id', '')::uuid;
    if target_user_id is null or target_user_id = admin_id then
      raise exception 'A platform administrator cannot suspend their own account'
        using errcode = '22023';
    end if;

    select * into target_member
    from public.smartsell_members m
    where m.id = target_user_id
    for update;

    if not found then
      raise exception 'User not found'
        using errcode = 'P0002';
    end if;

    if exists (
      select 1
      from private.smartsell_platform_admins a
      where a.user_id = target_user_id and a.active
    ) then
      raise exception 'Platform administrator access cannot be changed here'
        using errcode = '42501';
    end if;

    next_active := case when target_member.active = 1 then 0 else 1 end;
    update public.smartsell_members
    set active = next_active
    where id = target_member.id;

    insert into public.smartsell_events (
      business_id, branch_id, actor_id, category, entity, description, reference
    ) values (
      target_member.business_id,
      target_member.branch_id,
      admin_id,
      'Platform Admin',
      target_member.name,
      case when next_active = 1
        then 'Account reactivated by platform administrator'
        else 'Account suspended by platform administrator'
      end,
      target_member.id::text
    );

    return jsonb_build_object('ok', true, 'active', next_active);
  end if;

  if requested_range not in ('today', '7d', '30d', 'month') then
    raise exception 'Unsupported platform admin date range'
      using errcode = '22023';
  end if;

  range_start := case requested_range
    when 'today' then date_trunc('day', now())
    when '7d' then date_trunc('day', now()) - interval '6 days'
    when 'month' then date_trunc('month', now())
    else date_trunc('day', now()) - interval '29 days'
  end;

  select jsonb_build_object(
    'stats', jsonb_build_object(
      'businesses', (select count(*) from public.smartsell_businesses),
      'users', (select count(*) from public.smartsell_members),
      'active', (select count(*) from public.smartsell_members where active = 1),
      'suspended', (select count(*) from public.smartsell_members where active = 0),
      'branches', (select count(*) from public.smartsell_branches where active = 1),
      'products', (select count(*) from public.smartsell_products where active = 1),
      'low_stock', (
        select count(*)
        from public.smartsell_products p
        join public.smartsell_branches br
          on br.business_id = p.business_id and br.active = 1
        left join public.smartsell_stock s
          on s.product_id = p.id and s.branch_id = br.id
        where p.active = 1 and coalesce(s.quantity, 0) <= p.threshold
      ),
      'sales_by_currency', coalesce((
        select jsonb_agg(jsonb_build_object(
          'currency', totals.currency,
          'total', totals.total,
          'transactions', totals.transactions
        ) order by totals.currency)
        from (
          select b.currency, sum(s.total)::numeric as total, count(*) as transactions
          from public.smartsell_sales s
          join public.smartsell_businesses b on b.id = s.business_id
          where s.created_at >= range_start and s.status = 'completed'
          group by b.currency
        ) totals
      ), '[]'::jsonb),
      'stock_value_by_currency', coalesce((
        select jsonb_agg(jsonb_build_object(
          'currency', totals.currency,
          'value', totals.value
        ) order by totals.currency)
        from (
          select b.currency, sum(p.cost * coalesce(s.quantity, 0))::numeric as value
          from public.smartsell_products p
          join public.smartsell_businesses b on b.id = p.business_id
          join public.smartsell_branches br
            on br.business_id = p.business_id and br.active = 1
          left join public.smartsell_stock s
            on s.product_id = p.id and s.branch_id = br.id
          where p.active = 1
          group by b.currency
        ) totals
      ), '[]'::jsonb)
    ),
    'businesses', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.name)
      from (
        select b.id, b.name, b.category, b.custom_category, b.country, b.currency,
          b.timezone, b.created_at,
          count(distinct m.id) as member_count,
          count(distinct br.id) filter (where br.active = 1) as branch_count,
          count(distinct m.id) filter (where m.role = 'owner') as owner_count,
          max(m.name) filter (where m.role = 'owner') as owner_name
        from public.smartsell_businesses b
        left join public.smartsell_members m on m.business_id = b.id
        left join public.smartsell_branches br on br.business_id = b.id
        group by b.id
      ) rows
    ), '[]'::jsonb),
    'users', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.name)
      from (
        select m.id, m.name, m.email, m.business_id, b.name as business_name,
          m.branch_id, br.name as branch_name, m.role, m.active,
          m.created_at,
          exists (
            select 1 from private.smartsell_platform_admins a
            where a.user_id = m.id and a.active
          ) as is_platform_admin
        from public.smartsell_members m
        join public.smartsell_businesses b on b.id = m.business_id
        join public.smartsell_branches br
          on br.id = m.branch_id and br.business_id = m.business_id
      ) rows
    ), '[]'::jsonb),
    'branches', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.business_name, rows.name)
      from (
        select br.id, br.business_id, br.name, br.address, br.phone, br.active,
          b.name as business_name, b.category, b.country, b.currency,
          count(distinct m.id) as staff_count
        from public.smartsell_branches br
        join public.smartsell_businesses b on b.id = br.business_id
        left join public.smartsell_members m on m.branch_id = br.id
        group by br.id, b.name, b.category, b.country, b.currency
      ) rows
    ), '[]'::jsonb),
    'business_types', coalesce((
      select jsonb_agg(jsonb_build_object('type', categories.category, 'count', categories.count)
        order by categories.count desc, categories.category)
      from (
        select coalesce(nullif(b.category, ''), 'Other') as category, count(*) as count
        from public.smartsell_businesses b
        group by coalesce(nullif(b.category, ''), 'Other')
      ) categories
    ), '[]'::jsonb),
    'growth', coalesce((
      select jsonb_agg(jsonb_build_object('date', days.day::date, 'count', (
        select count(*) from public.smartsell_businesses b
        where b.created_at < days.day + interval '1 day'
      )) order by days.day)
      from generate_series(
        range_start,
        date_trunc('day', now()),
        interval '1 day'
      ) as days(day)
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.created_at desc)
      from (
        select e.id, e.business_id, e.branch_id, e.category, e.entity,
          e.description, e.amount, e.created_at, b.name as business_name,
          m.name as actor_name
        from public.smartsell_events e
        join public.smartsell_businesses b on b.id = e.business_id
        left join public.smartsell_members m on m.id = e.actor_id
        order by e.created_at desc
        limit 10
      ) rows
    ), '[]'::jsonb),
    'recent_sales', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.created_at desc)
      from (
        select s.id, s.reference, s.total, s.paid, s.method, s.status,
          s.created_at, s.business_id, b.name as business_name,
          b.currency, b.category, br.name as branch_name
        from public.smartsell_sales s
        join public.smartsell_businesses b on b.id = s.business_id
        join public.smartsell_branches br
          on br.id = s.branch_id and br.business_id = s.business_id
        where s.created_at >= range_start
        order by s.created_at desc
        limit 10
      ) rows
    ), '[]'::jsonb),
    'range', requested_range,
    'subscription_revenue_available', false
  ) into result;

  return result;
end
$$;

revoke all on function private.smartsell_platform_admin(jsonb) from public, anon, authenticated;

create or replace function public.smartsell_platform_admin(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.smartsell_platform_admin(command);
$$;

revoke all on function public.smartsell_platform_admin(jsonb) from public, anon;
grant execute on function private.smartsell_platform_admin(jsonb) to authenticated;
grant execute on function public.smartsell_platform_admin(jsonb) to authenticated;