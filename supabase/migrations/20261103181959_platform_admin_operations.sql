create or replace function private.smartsell_platform_admin_operations(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := auth.uid();
  requested_action text := coalesce(command->>'action', '');
  requested_range text := coalesce(command->>'range', '30d');
  requested_search text := nullif(btrim(command->>'search'), '');
  range_start timestamptz;
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

  if requested_action not in ('inventory', 'sales', 'transactions', 'analytics', 'audit_logs') then
    raise exception 'Unsupported platform admin operation'
      using errcode = '22023';
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

  if requested_action = 'inventory' then
    with product_rows as (
      select
        p.id, p.business_id, b.name as business_name, b.currency,
        p.name, p.sku, p.barcode, p.category, p.unit, p.cost, p.price,
        p.threshold,
        coalesce(sum(coalesce(s.quantity, 0)), 0)::numeric as total_quantity,
        count(*) filter (
          where br.id is not null and coalesce(s.quantity, 0) <= p.threshold
        )::integer as low_stock_locations,
        coalesce(jsonb_agg(jsonb_build_object(
          'branch_id', br.id,
          'branch_name', br.name,
          'quantity', coalesce(s.quantity, 0),
          'low_stock', coalesce(s.quantity, 0) <= p.threshold
        ) order by br.name) filter (where br.id is not null), '[]'::jsonb) as branch_stock
      from public.smartsell_products p
      join public.smartsell_businesses b on b.id = p.business_id
      left join public.smartsell_branches br
        on br.business_id = p.business_id and br.active = 1
      left join public.smartsell_stock s
        on s.product_id = p.id and s.branch_id = br.id
      where p.active = 1
        and (
          requested_search is null
          or p.name ilike '%' || requested_search || '%'
          or p.sku ilike '%' || requested_search || '%'
          or b.name ilike '%' || requested_search || '%'
        )
      group by p.id, b.name, b.currency
    )
    select jsonb_build_object(
      'inventory', coalesce((
        select jsonb_agg(to_jsonb(rows) order by rows.business_name, rows.name)
        from (
          select * from product_rows
          order by business_name, name, id
          limit 250
        ) rows
      ), '[]'::jsonb),
      'total', (select count(*) from product_rows),
      'limited', (select count(*) > 250 from product_rows),
      'range', requested_range
    ) into result;
    return result;
  end if;

  if requested_action = 'sales' then
    select jsonb_build_object(
      'sales', coalesce((
        select jsonb_agg(to_jsonb(rows) order by rows.created_at desc)
        from (
          select s.id, s.reference, s.total, s.paid, s.discount, s.tax,
            s.method, s.status, s.created_at, b.name as business_name,
            b.currency, b.category, br.name as branch_name, m.name as actor_name
          from public.smartsell_sales s
          join public.smartsell_businesses b on b.id = s.business_id
          join public.smartsell_branches br
            on br.id = s.branch_id and br.business_id = s.business_id
          left join public.smartsell_members m on m.id = s.actor_id
          where s.created_at >= range_start
            and (
              requested_search is null
              or s.reference ilike '%' || requested_search || '%'
              or b.name ilike '%' || requested_search || '%'
              or br.name ilike '%' || requested_search || '%'
            )
          order by s.created_at desc, s.id desc
          limit 100
        ) rows
      ), '[]'::jsonb),
      'total', (
        select count(*)
        from public.smartsell_sales s
        join public.smartsell_businesses b on b.id = s.business_id
        join public.smartsell_branches br
          on br.id = s.branch_id and br.business_id = s.business_id
        where s.created_at >= range_start
          and (
            requested_search is null
            or s.reference ilike '%' || requested_search || '%'
            or b.name ilike '%' || requested_search || '%'
            or br.name ilike '%' || requested_search || '%'
          )
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
      'range', requested_range
    ) into result;
    return result;
  end if;

  if requested_action = 'transactions' then
    with all_transactions as (
      select s.id, s.created_at, 'Sale'::text as type, s.reference,
        b.name as business_name, br.name as branch_name, b.currency,
        s.total as amount, s.paid, s.status, s.method as detail
      from public.smartsell_sales s
      join public.smartsell_businesses b on b.id = s.business_id
      join public.smartsell_branches br
        on br.id = s.branch_id and br.business_id = s.business_id
      where s.created_at >= range_start
      union all
      select p.id, p.created_at, 'Purchase'::text, p.reference,
        b.name, br.name, b.currency, p.total, p.paid, p.status,
        coalesce(pr.name, 'Purchase')
      from public.smartsell_purchases p
      join public.smartsell_businesses b on b.id = p.business_id
      join public.smartsell_branches br
        on br.id = p.branch_id and br.business_id = p.business_id
      left join public.smartsell_products pr
        on pr.id = p.product_id and pr.business_id = p.business_id
      where p.created_at >= range_start
      union all
      select e.id, e.created_at, 'Expense'::text, e.name,
        b.name, br.name, b.currency, e.amount, e.amount, 'posted'::text,
        e.category
      from public.smartsell_expenses e
      join public.smartsell_businesses b on b.id = e.business_id
      join public.smartsell_branches br
        on br.id = e.branch_id and br.business_id = e.business_id
      where e.created_at >= range_start
    ),
    filtered as (
      select *
      from all_transactions
      where requested_search is null
        or reference ilike '%' || requested_search || '%'
        or business_name ilike '%' || requested_search || '%'
        or type ilike '%' || requested_search || '%'
        or status ilike '%' || requested_search || '%'
    )
    select jsonb_build_object(
      'transactions', coalesce((
        select jsonb_agg(to_jsonb(rows) order by rows.created_at desc, rows.id desc)
        from (
          select * from filtered
          order by created_at desc, id desc
          limit 100
        ) rows
      ), '[]'::jsonb),
      'total', (select count(*) from filtered),
      'totals_by_type', coalesce((
        select jsonb_agg(jsonb_build_object('type', totals.type, 'count', totals.count)
          order by totals.type)
        from (
          select type, count(*) as count from all_transactions group by type
        ) totals
      ), '[]'::jsonb),
      'range', requested_range
    ) into result;
    return result;
  end if;

  if requested_action = 'audit_logs' then
    select jsonb_build_object(
      'audit_logs', coalesce((
        select jsonb_agg(to_jsonb(rows) order by rows.created_at desc)
        from (
          select e.id, e.created_at, e.category, e.entity, e.description,
            e.reference, e.amount, e.business_id, b.name as business_name,
            b.currency,
            e.branch_id, br.name as branch_name, e.actor_id, m.name as actor_name
          from public.smartsell_events e
          join public.smartsell_businesses b on b.id = e.business_id
          left join public.smartsell_branches br
            on br.id = e.branch_id and br.business_id = e.business_id
          left join public.smartsell_members m on m.id = e.actor_id
          where e.created_at >= range_start
            and (
              requested_search is null
              or e.category ilike '%' || requested_search || '%'
              or e.entity ilike '%' || requested_search || '%'
              or e.description ilike '%' || requested_search || '%'
              or b.name ilike '%' || requested_search || '%'
              or coalesce(m.name, '') ilike '%' || requested_search || '%'
            )
          order by e.created_at desc, e.id desc
          limit 100
        ) rows
      ), '[]'::jsonb),
      'total', (
        select count(*)
        from public.smartsell_events e
        join public.smartsell_businesses b on b.id = e.business_id
        left join public.smartsell_members m on m.id = e.actor_id
        where e.created_at >= range_start
          and (
            requested_search is null
            or e.category ilike '%' || requested_search || '%'
            or e.entity ilike '%' || requested_search || '%'
            or e.description ilike '%' || requested_search || '%'
            or b.name ilike '%' || requested_search || '%'
            or coalesce(m.name, '') ilike '%' || requested_search || '%'
          )
      ),
      'range', requested_range
    ) into result;
    return result;
  end if;

  select jsonb_build_object(
    'sales_by_currency', coalesce((
      select jsonb_agg(jsonb_build_object(
        'currency', totals.currency, 'total', totals.total,
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
    'purchases_by_currency', coalesce((
      select jsonb_agg(jsonb_build_object(
        'currency', totals.currency, 'total', totals.total, 'transactions', totals.transactions
      ) order by totals.currency)
      from (
        select b.currency, sum(p.total)::numeric as total, count(*) as transactions
        from public.smartsell_purchases p
        join public.smartsell_businesses b on b.id = p.business_id
        where p.created_at >= range_start
        group by b.currency
      ) totals
    ), '[]'::jsonb),
    'expenses_by_currency', coalesce((
      select jsonb_agg(jsonb_build_object(
        'currency', totals.currency, 'total', totals.total, 'transactions', totals.transactions
      ) order by totals.currency)
      from (
        select b.currency, sum(e.amount)::numeric as total, count(*) as transactions
        from public.smartsell_expenses e
        join public.smartsell_businesses b on b.id = e.business_id
        where e.created_at >= range_start
        group by b.currency
      ) totals
    ), '[]'::jsonb),
    'daily_activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', days.day::date,
        'sales', (select count(*) from public.smartsell_sales s
          where s.created_at >= days.day and s.created_at < days.day + interval '1 day'),
        'purchases', (select count(*) from public.smartsell_purchases p
          where p.created_at >= days.day and p.created_at < days.day + interval '1 day'),
        'expenses', (select count(*) from public.smartsell_expenses e
          where e.created_at >= days.day and e.created_at < days.day + interval '1 day')
      ) order by days.day)
      from generate_series(
        date_trunc('day', range_start),
        date_trunc('day', now()),
        interval '1 day'
      ) as days(day)
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
    'range', requested_range
  ) into result;

  return result;
end
$$;

revoke all on function private.smartsell_platform_admin_operations(jsonb)
  from public, anon, authenticated;

create or replace function public.smartsell_platform_admin_operations(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.smartsell_platform_admin_operations(command);
$$;

revoke all on function public.smartsell_platform_admin_operations(jsonb) from public, anon;
grant execute on function private.smartsell_platform_admin_operations(jsonb) to authenticated;
grant execute on function public.smartsell_platform_admin_operations(jsonb) to authenticated;