create table private.smartsell_subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  description text not null default '',
  amount bigint not null check (amount between 0 and 1000000000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  trial_days integer not null default 0 check (trial_days between 0 and 365),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.smartsell_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.smartsell_businesses(id),
  plan_id uuid not null references private.smartsell_subscription_plans(id),
  status text not null check (
    status in ('trialing', 'active', 'past_due', 'canceled', 'expired')
  ),
  billing_interval text not null check (billing_interval in ('month', 'year')),
  amount bigint not null check (amount between 0 and 1000000000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  starts_at timestamptz not null default now(),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  trial_end timestamptz,
  canceled_at timestamptz,
  cancel_at_period_end boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (current_period_end > current_period_start)
);

create unique index smartsell_subscriptions_one_current_per_business
  on private.smartsell_subscriptions (business_id)
  where status in ('trialing', 'active', 'past_due');
create index smartsell_subscriptions_business_created
  on private.smartsell_subscriptions (business_id, created_at desc);
create index smartsell_subscriptions_period_end
  on private.smartsell_subscriptions (current_period_end)
  where status in ('trialing', 'active', 'past_due');

create table private.smartsell_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references private.smartsell_subscriptions(id),
  business_id uuid not null references public.smartsell_businesses(id),
  amount bigint not null check (amount between 1 and 1000000000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('pending', 'paid', 'failed', 'refunded')),
  method text not null check (
    method in ('manual', 'cash', 'bank_transfer', 'mobile_money', 'other')
  ),
  external_reference text,
  note text not null default '' check (length(note) <= 1000),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index smartsell_subscription_payments_external_reference
  on private.smartsell_subscription_payments (business_id, external_reference)
  where external_reference is not null;
create index smartsell_subscription_payments_business_created
  on private.smartsell_subscription_payments (business_id, created_at desc);

revoke all on table private.smartsell_subscription_plans
  from public, anon, authenticated;
revoke all on table private.smartsell_subscriptions
  from public, anon, authenticated;
revoke all on table private.smartsell_subscription_payments
  from public, anon, authenticated;

create or replace function private.smartsell_platform_billing(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := auth.uid();
  requested_action text := coalesce(command->>'action', 'list');
  requested_range text := coalesce(command->>'range', '30d');
  range_start timestamptz;
  target_plan_id uuid;
  target_business_id uuid;
  target_subscription_id uuid;
  target_plan private.smartsell_subscription_plans;
  target_subscription private.smartsell_subscriptions;
  target_business_name text;
  plan_name text;
  plan_description text;
  plan_amount bigint;
  plan_currency text;
  plan_interval text;
  plan_trial_days integer;
  plan_active boolean;
  next_status text;
  payment_status text;
  payment_method text;
  payment_amount bigint;
  payment_currency text;
  payment_reference text;
  payment_note text;
  trial_finish timestamptz;
  period_begin timestamptz;
  period_finish timestamptz;
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

  if requested_action not in (
    'list', 'create_plan', 'update_plan', 'assign_subscription',
    'cancel_subscription', 'record_payment'
  ) then
    raise exception 'Unsupported platform billing action'
      using errcode = '22023';
  end if;

  if requested_range not in ('today', '7d', '30d', 'month') then
    raise exception 'Unsupported platform billing date range'
      using errcode = '22023';
  end if;

  range_start := case requested_range
    when 'today' then date_trunc('day', now())
    when '7d' then date_trunc('day', now()) - interval '6 days'
    when 'month' then date_trunc('month', now())
    else date_trunc('day', now()) - interval '29 days'
  end;

  if requested_action = 'create_plan' then
    plan_name := btrim(coalesce(command->>'name', ''));
    plan_description := coalesce(command->>'description', '');
    plan_currency := upper(coalesce(command->>'currency', ''));
    plan_interval := coalesce(command->>'billing_interval', '');
    plan_amount := nullif(command->>'amount', '')::bigint;
    plan_trial_days := coalesce(nullif(command->>'trial_days', '')::integer, 0);

    if length(plan_name) not between 1 and 100
      or length(plan_description) > 2000
      or plan_amount is null or plan_amount < 0 or plan_amount > 1000000000000
      or plan_currency !~ '^[A-Z]{3}$'
      or plan_interval not in ('month', 'year')
      or plan_trial_days not between 0 and 365 then
      raise exception 'Enter a valid plan name, price, currency, billing interval, and trial length'
        using errcode = '22023';
    end if;

    insert into private.smartsell_subscription_plans (
      name, description, amount, currency, billing_interval, trial_days
    ) values (
      plan_name, plan_description, plan_amount, plan_currency,
      plan_interval, plan_trial_days
    ) returning id into target_plan_id;

    return jsonb_build_object('ok', true, 'plan_id', target_plan_id);
  end if;

  if requested_action = 'update_plan' then
    target_plan_id := nullif(command->>'plan_id', '')::uuid;
    if target_plan_id is null then
      raise exception 'Choose a plan to update' using errcode = '22023';
    end if;

    select * into target_plan
    from private.smartsell_subscription_plans p
    where p.id = target_plan_id
    for update;

    if not found then
      raise exception 'Plan not found' using errcode = 'P0002';
    end if;

    plan_name := btrim(coalesce(command->>'name', target_plan.name));
    plan_description := coalesce(command->>'description', target_plan.description);
    plan_currency := upper(coalesce(command->>'currency', target_plan.currency));
    plan_interval := coalesce(command->>'billing_interval', target_plan.billing_interval);
    plan_amount := coalesce(nullif(command->>'amount', '')::bigint, target_plan.amount);
    plan_trial_days := coalesce(
      nullif(command->>'trial_days', '')::integer, target_plan.trial_days
    );
    plan_active := coalesce(
      nullif(command->>'active', '')::boolean, target_plan.active
    );

    if length(plan_name) not between 1 and 100
      or length(plan_description) > 2000
      or plan_amount < 0 or plan_amount > 1000000000000
      or plan_currency !~ '^[A-Z]{3}$'
      or plan_interval not in ('month', 'year')
      or plan_trial_days not between 0 and 365 then
      raise exception 'Enter a valid plan name, price, currency, billing interval, and trial length'
        using errcode = '22023';
    end if;

    update private.smartsell_subscription_plans
    set name = plan_name, description = plan_description, amount = plan_amount,
      currency = plan_currency, billing_interval = plan_interval,
      trial_days = plan_trial_days, active = plan_active, updated_at = now()
    where id = target_plan_id;

    return jsonb_build_object('ok', true, 'plan_id', target_plan_id);
  end if;

  if requested_action = 'assign_subscription' then
    target_business_id := nullif(command->>'business_id', '')::uuid;
    target_plan_id := nullif(command->>'plan_id', '')::uuid;

    if target_business_id is null or target_plan_id is null then
      raise exception 'Choose a business and subscription plan'
        using errcode = '22023';
    end if;

    select b.name into target_business_name
    from public.smartsell_businesses b
    where b.id = target_business_id
    for update;

    if not found then
      raise exception 'Business not found' using errcode = 'P0002';
    end if;

    select * into target_plan
    from private.smartsell_subscription_plans p
    where p.id = target_plan_id and p.active
    for share;

    if not found then
      raise exception 'Choose an active subscription plan'
        using errcode = '22023';
    end if;

    plan_amount := coalesce(
      nullif(command->>'amount', '')::bigint, target_plan.amount
    );
    plan_currency := upper(coalesce(command->>'currency', target_plan.currency));

    if plan_amount < 0 or plan_amount > 1000000000000
      or plan_currency !~ '^[A-Z]{3}$' then
      raise exception 'Enter a valid subscription price and currency'
        using errcode = '22023';
    end if;

    update private.smartsell_subscriptions
    set status = 'canceled', canceled_at = now(), cancel_at_period_end = false,
      current_period_end = greatest(current_period_start + interval '1 second', now())
    where business_id = target_business_id
      and status in ('trialing', 'active', 'past_due');

    trial_finish := case when target_plan.trial_days > 0
      then now() + make_interval(days => target_plan.trial_days)
      else null
    end;
    period_begin := coalesce(trial_finish, now());
    period_finish := case target_plan.billing_interval
      when 'year' then period_begin + interval '1 year'
      else period_begin + interval '1 month'
    end;
    next_status := case when trial_finish is not null then 'trialing' else 'active' end;

    insert into private.smartsell_subscriptions (
      business_id, plan_id, status, billing_interval, amount, currency,
      starts_at, current_period_start, current_period_end, trial_end, created_by
    ) values (
      target_business_id, target_plan.id, next_status, target_plan.billing_interval,
      plan_amount, plan_currency, now(), period_begin, period_finish,
      trial_finish, admin_id
    ) returning id into target_subscription_id;

    insert into public.smartsell_events (
      business_id, branch_id, actor_id, category, entity, description, reference
    ) values (
      target_business_id, null, admin_id, 'Subscription', target_business_name,
      'Subscription assigned to plan ' || target_plan.name,
      target_subscription_id::text
    );

    return jsonb_build_object(
      'ok', true, 'subscription_id', target_subscription_id, 'status', next_status
    );
  end if;

  if requested_action = 'cancel_subscription' then
    target_subscription_id := nullif(command->>'subscription_id', '')::uuid;
    if target_subscription_id is null then
      raise exception 'Choose a subscription to cancel' using errcode = '22023';
    end if;

    update private.smartsell_subscriptions s
    set status = 'canceled', canceled_at = now(), cancel_at_period_end = false,
      current_period_end = greatest(s.current_period_start + interval '1 second', now())
    where s.id = target_subscription_id
      and s.status in ('trialing', 'active', 'past_due')
    returning s.* into target_subscription;

    if not found then
      raise exception 'Active subscription not found' using errcode = 'P0002';
    end if;

    select b.name into target_business_name
    from public.smartsell_businesses b
    where b.id = target_subscription.business_id;

    insert into public.smartsell_events (
      business_id, branch_id, actor_id, category, entity, description, reference
    ) values (
      target_subscription.business_id, null, admin_id, 'Subscription',
      target_business_name, 'Subscription canceled by platform administrator',
      target_subscription.id::text
    );

    return jsonb_build_object('ok', true, 'subscription_id', target_subscription_id);
  end if;

  if requested_action = 'record_payment' then
    target_subscription_id := nullif(command->>'subscription_id', '')::uuid;
    payment_amount := nullif(command->>'amount', '')::bigint;
    payment_currency := upper(coalesce(command->>'currency', ''));
    payment_status := coalesce(command->>'status', '');
    payment_method := coalesce(command->>'method', '');
    payment_reference := nullif(btrim(command->>'external_reference'), '');
    payment_note := coalesce(command->>'note', '');

    if target_subscription_id is null
      or payment_amount is null or payment_amount < 1 or payment_amount > 1000000000000
      or payment_currency !~ '^[A-Z]{3}$'
      or payment_status not in ('pending', 'paid', 'failed', 'refunded')
      or payment_method not in ('manual', 'cash', 'bank_transfer', 'mobile_money', 'other')
      or length(payment_note) > 1000 then
      raise exception 'Enter a valid payment amount, currency, status, method, and note'
        using errcode = '22023';
    end if;

    select * into target_subscription
    from private.smartsell_subscriptions s
    where s.id = target_subscription_id
    for share;

    if not found then
      raise exception 'Subscription not found' using errcode = 'P0002';
    end if;

    insert into private.smartsell_subscription_payments (
      subscription_id, business_id, amount, currency, status, method,
      external_reference, note, recorded_by
    ) values (
      target_subscription.id, target_subscription.business_id, payment_amount,
      payment_currency, payment_status, payment_method, payment_reference,
      payment_note, admin_id
    ) returning id into target_plan_id;

    select b.name into target_business_name
    from public.smartsell_businesses b
    where b.id = target_subscription.business_id;

    insert into public.smartsell_events (
      business_id, branch_id, actor_id, category, entity, description, reference, amount
    ) values (
      target_subscription.business_id, null, admin_id, 'Subscription Payment',
      target_business_name,
      'Manual subscription payment recorded with status ' || payment_status,
      target_plan_id::text, payment_amount
    );

    return jsonb_build_object('ok', true, 'payment_id', target_plan_id);
  end if;

  select jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.active desc, rows.amount, rows.name)
      from (
        select p.id, p.name, p.description, p.amount, p.currency,
          p.billing_interval, p.trial_days, p.active, p.created_at, p.updated_at,
          count(s.id) filter (
            where s.status in ('trialing', 'active', 'past_due')
          ) as current_subscribers
        from private.smartsell_subscription_plans p
        left join private.smartsell_subscriptions s on s.plan_id = p.id
        group by p.id
      ) rows
    ), '[]'::jsonb),
    'subscriptions', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.created_at desc)
      from (
        select s.id, s.business_id, b.name as business_name, b.currency as business_currency,
          s.plan_id, p.name as plan_name, s.status, s.billing_interval, s.amount,
          s.currency, s.starts_at, s.current_period_start, s.current_period_end,
          s.trial_end, s.canceled_at, s.cancel_at_period_end, s.created_at
        from private.smartsell_subscriptions s
        join public.smartsell_businesses b on b.id = s.business_id
        join private.smartsell_subscription_plans p on p.id = s.plan_id
      ) rows
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.created_at desc)
      from (
        select payment.id, payment.subscription_id, payment.business_id,
          b.name as business_name, payment.amount, payment.currency, payment.status,
          payment.method, payment.external_reference, payment.note,
          payment.created_at, actor.name as recorded_by
        from private.smartsell_subscription_payments payment
        join public.smartsell_businesses b on b.id = payment.business_id
        left join public.smartsell_members actor on actor.id = payment.recorded_by
        where payment.created_at >= range_start
        order by payment.created_at desc, payment.id desc
        limit 100
      ) rows
    ), '[]'::jsonb),
    'businesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'currency', b.currency
      ) order by b.name)
      from public.smartsell_businesses b
    ), '[]'::jsonb),
    'summary', jsonb_build_object(
      'plans', (select count(*) from private.smartsell_subscription_plans where active),
      'subscribers', (
        select count(*) from private.smartsell_subscriptions
        where status in ('trialing', 'active', 'past_due')
      ),
      'trialing', (
        select count(*) from private.smartsell_subscriptions where status = 'trialing'
      ),
      'past_due', (
        select count(*) from private.smartsell_subscriptions where status = 'past_due'
      ),
      'paid_by_currency', coalesce((
        select jsonb_agg(jsonb_build_object(
          'currency', totals.currency, 'total', totals.total, 'payments', totals.payments
        ) order by totals.currency)
        from (
          select payment.currency, sum(payment.amount)::numeric as total,
            count(*) as payments
          from private.smartsell_subscription_payments payment
          where payment.status = 'paid' and payment.created_at >= range_start
          group by payment.currency
        ) totals
      ), '[]'::jsonb)
    ),
    'range', requested_range,
    'payment_provider_configured', false
  ) into result;

  return result;
end
$$;

revoke all on function private.smartsell_platform_billing(jsonb)
  from public, anon, authenticated;

create or replace function public.smartsell_platform_billing(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.smartsell_platform_billing(command);
$$;

revoke all on function public.smartsell_platform_billing(jsonb) from public, anon;
grant execute on function private.smartsell_platform_billing(jsonb) to authenticated;
grant execute on function public.smartsell_platform_billing(jsonb) to authenticated;