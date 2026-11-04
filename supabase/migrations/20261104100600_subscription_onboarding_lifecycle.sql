create table private.smartsell_plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references private.smartsell_subscription_plans(id) on delete cascade,
  feature_key text not null check (length(btrim(feature_key)) between 1 and 100),
  label text not null check (length(btrim(label)) between 1 and 150),
  limit_value bigint,
  enabled boolean not null default true,
  unique (plan_id, feature_key)
);

alter table private.smartsell_plan_entitlements enable row level security;
revoke all on table private.smartsell_plan_entitlements from public, anon, authenticated;

alter table private.smartsell_platform_business_reviews
  add column selected_plan_id uuid references private.smartsell_subscription_plans(id),
  add column region text not null default '',
  add column registration_number text not null default '',
  add column documents jsonb not null default '[]'::jsonb;

alter table public.smartsell_businesses
  add column region text not null default '',
  add column registration_number text not null default '',
  add column subscription_enforced boolean not null default false;

alter table private.smartsell_subscription_payments
  add column evidence_path text,
  add column submitted_at timestamptz not null default now(),
  add column verified_at timestamptz,
  add column reviewed_by uuid references auth.users(id),
  add column rejection_reason text not null default '';

alter table private.smartsell_subscriptions
  drop constraint if exists smartsell_subscriptions_status_check;
alter table private.smartsell_subscriptions
  add constraint smartsell_subscriptions_status_check
  check (status in (
    'pending_approval', 'awaiting_payment', 'payment_submitted', 'payment_review',
    'payment_rejected', 'trialing', 'active', 'past_due', 'canceled', 'expired',
    'suspended'
  ));

alter table private.smartsell_subscription_payments
  drop constraint if exists smartsell_subscription_payments_status_check;
alter table private.smartsell_subscription_payments
  add constraint smartsell_subscription_payments_status_check
  check (status in ('pending', 'paid', 'failed', 'refunded'));

create unique index smartsell_subscription_payments_verified_reference
  on private.smartsell_subscription_payments (external_reference)
  where status = 'paid' and external_reference is not null;

drop index if exists private.smartsell_subscriptions_one_current_per_business;
create unique index smartsell_subscriptions_one_current_per_business
  on private.smartsell_subscriptions (business_id)
  where status in (
    'pending_approval', 'awaiting_payment', 'payment_submitted', 'payment_review',
    'payment_rejected', 'trialing', 'active', 'past_due', 'suspended'
  );

create table private.smartsell_payment_review_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references private.smartsell_subscription_payments(id),
  reviewer_id uuid references auth.users(id),
  decision text not null check (
    decision in ('submitted', 'verified', 'rejected', 'information_requested')
  ),
  reason text not null default '' check (length(reason) <= 2000),
  created_at timestamptz not null default now()
);

create index smartsell_payment_review_events_payment_created
  on private.smartsell_payment_review_events (payment_id, created_at desc);
alter table private.smartsell_payment_review_events enable row level security;
revoke all on table private.smartsell_payment_review_events from public, anon, authenticated;

create table private.smartsell_billing_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.smartsell_businesses(id),
  subscription_id uuid not null references private.smartsell_subscriptions(id),
  payment_id uuid references private.smartsell_subscription_payments(id),
  event_type text not null check (
    event_type in ('trial_activation', 'payment_verified', 'refund', 'manual_adjustment')
  ),
  amount bigint not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now()
);

create unique index smartsell_billing_ledger_one_trial_activation
  on private.smartsell_billing_ledger (subscription_id)
  where event_type = 'trial_activation';
create unique index smartsell_billing_ledger_one_payment_posting
  on private.smartsell_billing_ledger (payment_id)
  where payment_id is not null;
alter table private.smartsell_billing_ledger enable row level security;
revoke all on table private.smartsell_billing_ledger from public, anon, authenticated;

update private.smartsell_subscription_payments
set verified_at = created_at,
    reviewed_by = recorded_by
where status = 'paid' and verified_at is null;

insert into private.smartsell_billing_ledger (
  business_id, subscription_id, payment_id, event_type, amount, currency, created_at
)
select payment.business_id, payment.subscription_id, payment.id,
  'payment_verified', payment.amount, payment.currency, payment.created_at
from private.smartsell_subscription_payments payment
where payment.status = 'paid'
on conflict do nothing;

alter table private.smartsell_platform_settings
  drop constraint if exists smartsell_platform_settings_setting_key_check;
alter table private.smartsell_platform_settings
  add constraint smartsell_platform_settings_setting_key_check
  check (setting_key in (
    'site_name', 'support_email', 'support_phone', 'website_url',
    'contact_address', 'supported_countries', 'supported_currencies',
    'business_types', 'payment_instructions'
  ));

update private.smartsell_subscription_plans
set name = 'Free Trial', amount = 0, currency = 'TZS',
    billing_interval = 'month', updated_at = now()
where lower(name) in ('free', 'free trial');

update private.smartsell_subscription_plans
set amount = case lower(name)
      when 'starter' then 2000000
      when 'growth' then 5000000
      when 'professional' then 10000000
      when 'enterprise' then 20000000
      else amount
    end,
    currency = 'TZS',
    billing_interval = 'month',
    trial_days = 0,
    updated_at = now()
where lower(name) in ('starter', 'growth', 'professional', 'enterprise');

alter table private.smartsell_subscription_plans
  drop constraint if exists smartsell_subscription_plans_trial_price_check;
alter table private.smartsell_subscription_plans
  add constraint smartsell_subscription_plans_trial_price_check
  check (amount > 0 or trial_days > 0);

create or replace function private.smartsell_signup_plans()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'description', p.description,
      'amount', p.amount,
      'currency', p.currency,
      'billing_interval', p.billing_interval,
      'trial_days', p.trial_days,
      'entitlements', coalesce((
        select jsonb_agg(jsonb_build_object(
          'feature_key', e.feature_key,
          'label', e.label,
          'limit_value', e.limit_value,
          'enabled', e.enabled
        ) order by e.label)
        from private.smartsell_plan_entitlements e
        where e.plan_id = p.id
      ), '[]'::jsonb)
    ) order by p.amount, p.name
  ), '[]'::jsonb)
  from private.smartsell_subscription_plans p
  where p.active;
$$;

create or replace function public.smartsell_signup_plans()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.smartsell_signup_plans();
$$;

revoke all on function private.smartsell_signup_plans() from public, anon, authenticated;
revoke all on function public.smartsell_signup_plans() from public, anon, authenticated;
grant execute on function public.smartsell_signup_plans() to anon, authenticated;

create or replace function private.smartsell_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from private.smartsell_platform_admins a
    where a.user_id = auth.uid() and a.active
  );
$$;

revoke all on function private.smartsell_is_platform_admin() from public, anon, authenticated;
grant execute on function private.smartsell_is_platform_admin() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-payment-evidence',
  'business-payment-evidence',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-registration-evidence',
  'business-registration-evidence',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Business owners upload registration evidence" on storage.objects;
create policy "Business owners upload registration evidence"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'business-registration-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Business owners and admins view registration evidence"
  on storage.objects;
create policy "Business owners and admins view registration evidence"
on storage.objects for select to authenticated
using (
  bucket_id = 'business-registration-evidence'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or private.smartsell_is_platform_admin()
  )
);

drop policy if exists "Business owners upload payment evidence" on storage.objects;
create policy "Business owners upload payment evidence"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'business-payment-evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Business owners view payment evidence" on storage.objects;
create policy "Business owners view payment evidence"
on storage.objects for select to authenticated
using (
  bucket_id = 'business-payment-evidence'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or private.smartsell_is_platform_admin()
  )
);

create or replace function private.smartsell_subscription_record_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_row private.smartsell_subscription_plans;
  review_status text;
  previous_trial boolean;
begin
  select * into plan_row
  from private.smartsell_subscription_plans p
  where p.id = new.plan_id and p.active;
  if not found then
    raise exception 'Choose an active subscription plan' using errcode = '22023';
  end if;

  select r.status into review_status
  from private.smartsell_platform_business_reviews r
  where r.business_id = new.business_id;

  new.amount := plan_row.amount;
  new.currency := plan_row.currency;
  new.billing_interval := plan_row.billing_interval;
  new.starts_at := now();
  new.current_period_start := now();
  new.current_period_end := now() + interval '1 second';
  new.trial_end := null;

  if review_status is distinct from 'approved' then
    new.status := 'pending_approval';
  elsif plan_row.amount = 0 then
    select exists (
      select 1
      from private.smartsell_subscriptions s
      join private.smartsell_subscription_plans p on p.id = s.plan_id
      where s.business_id = new.business_id and p.amount = 0
    ) into previous_trial;

    if previous_trial then
      new.status := 'expired';
    else
      new.status := 'trialing';
      new.current_period_end := now() + make_interval(days => plan_row.trial_days);
      new.trial_end := new.current_period_end;
    end if;
  else
    new.status := 'awaiting_payment';
  end if;

  update public.smartsell_businesses
  set subscription_enforced = true
  where id = new.business_id;

  update private.smartsell_platform_business_reviews
  set selected_plan_id = new.plan_id, updated_at = now()
  where business_id = new.business_id;

  return new;
end
$$;

drop trigger if exists smartsell_subscription_record_insert
  on private.smartsell_subscriptions;
create trigger smartsell_subscription_record_insert
before insert on private.smartsell_subscriptions
for each row execute function private.smartsell_subscription_record_insert();

revoke all on function private.smartsell_subscription_record_insert()
  from public, anon, authenticated;

create or replace function private.smartsell_trial_ledger_effect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'trialing' and new.trial_end is not null then
    insert into private.smartsell_billing_ledger (
      business_id, subscription_id, event_type, amount, currency
    ) values (
      new.business_id, new.id, 'trial_activation', 0, new.currency
    )
    on conflict (subscription_id) where event_type = 'trial_activation' do nothing;
  end if;
  return new;
end
$$;

create trigger smartsell_trial_ledger_effect
after insert on private.smartsell_subscriptions
for each row execute function private.smartsell_trial_ledger_effect();
revoke all on function private.smartsell_trial_ledger_effect()
  from public, anon, authenticated;

create or replace function private.smartsell_business_review_subscription_effect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription_row private.smartsell_subscriptions;
  plan_row private.smartsell_subscription_plans;
  activation_time timestamptz := now();
begin
  if new.status <> 'approved'
    or (tg_op = 'UPDATE' and old.status = 'approved')
    or new.selected_plan_id is null then
    return new;
  end if;

  select * into plan_row
  from private.smartsell_subscription_plans p
  where p.id = new.selected_plan_id and p.active;
  if not found then
    raise exception 'The selected subscription plan is no longer available'
      using errcode = '22023';
  end if;

  select * into subscription_row
  from private.smartsell_subscriptions s
  where s.business_id = new.business_id
    and s.plan_id = new.selected_plan_id
    and s.status = 'pending_approval'
  order by s.created_at desc
  limit 1
  for update;

  if not found then
    return new;
  end if;

  if plan_row.amount = 0 then
    update private.smartsell_subscriptions
    set status = 'trialing',
        starts_at = activation_time,
        current_period_start = activation_time,
        current_period_end = activation_time + make_interval(days => plan_row.trial_days),
        trial_end = activation_time + make_interval(days => plan_row.trial_days)
    where id = subscription_row.id;

    insert into private.smartsell_billing_ledger (
      business_id, subscription_id, event_type, amount, currency
    ) values (
      new.business_id, subscription_row.id, 'trial_activation', 0, plan_row.currency
    )
      on conflict (subscription_id) where event_type = 'trial_activation' do nothing;
  else
    update private.smartsell_subscriptions
    set status = 'awaiting_payment',
        starts_at = activation_time,
        current_period_start = activation_time,
        current_period_end = activation_time + interval '1 second',
        trial_end = null
    where id = subscription_row.id;
  end if;

  insert into public.smartsell_events (
    business_id, actor_id, category, entity, description, reference
  ) values (
    new.business_id, new.reviewed_by, 'Subscription',
    (select b.name from public.smartsell_businesses b where b.id = new.business_id),
    case when plan_row.amount = 0
      then 'Free trial activated for ' || plan_row.trial_days::text
        || ' days after business approval'
      else 'Business approved; subscription payment required'
    end,
    subscription_row.id::text
  );

  return new;
end
$$;

drop trigger if exists smartsell_business_review_subscription_effect
  on private.smartsell_platform_business_reviews;
create trigger smartsell_business_review_subscription_effect
after insert or update of status on private.smartsell_platform_business_reviews
for each row execute function private.smartsell_business_review_subscription_effect();

revoke all on function private.smartsell_business_review_subscription_effect()
  from public, anon, authenticated;

create or replace function private.smartsell_subscription_payment_effect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := auth.uid();
  subscription_row private.smartsell_subscriptions;
  payment_plan private.smartsell_subscription_plans;
  next_period_start timestamptz;
begin
  if new.status <> 'paid'
    or (tg_op = 'UPDATE' and old.status = 'paid') then
    return new;
  end if;

  if admin_id is null or not exists (
    select 1
    from private.smartsell_platform_admins a
    where a.user_id = admin_id and a.active
  ) then
    raise exception 'Platform admin access required'
      using errcode = '42501';
  end if;

  select * into subscription_row
  from private.smartsell_subscriptions s
  where s.id = new.subscription_id
  for update;

  if not found or subscription_row.business_id <> new.business_id
    or subscription_row.status not in (
      'awaiting_payment', 'payment_submitted', 'payment_review',
      'payment_rejected', 'trialing', 'active', 'past_due', 'expired'
    ) then
    raise exception 'Only a valid subscription can be activated by payment'
      using errcode = '22023';
  end if;

  select * into payment_plan
  from private.smartsell_subscription_plans p
  where p.id = subscription_row.plan_id;

  if new.currency <> subscription_row.currency
    or new.amount <> subscription_row.amount
    or new.amount <> payment_plan.amount then
    raise exception 'Verified payment must match the configured plan amount and currency'
      using errcode = '22023';
  end if;

  next_period_start := case
    when subscription_row.status = 'trialing' then now()
    else greatest(subscription_row.current_period_end, now())
  end;

  update private.smartsell_subscriptions
  set status = 'active',
      starts_at = case when starts_at > now() then now() else starts_at end,
      current_period_start = next_period_start,
      current_period_end = case billing_interval
        when 'year' then next_period_start + interval '1 year'
        else next_period_start + interval '1 month'
      end,
      trial_end = null
  where id = new.subscription_id;

  update private.smartsell_subscription_payments
  set verified_at = coalesce(verified_at, now()),
      reviewed_by = coalesce(reviewed_by, admin_id)
  where id = new.id;

  insert into private.smartsell_billing_ledger (
    business_id, subscription_id, payment_id, event_type, amount, currency
  ) values (
    new.business_id, new.subscription_id, new.id, 'payment_verified',
    new.amount, new.currency
  )
  on conflict do nothing;

  return new;
end
$$;

drop trigger if exists smartsell_subscription_payment_effect
  on private.smartsell_subscription_payments;
create trigger smartsell_subscription_payment_effect
after insert or update of status on private.smartsell_subscription_payments
for each row execute function private.smartsell_subscription_payment_effect();

revoke all on function private.smartsell_subscription_payment_effect()
  from public, anon, authenticated;

create or replace function private.ss_member()
returns public.smartsell_members
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  member_row public.smartsell_members;
  business_row public.smartsell_businesses;
  review_status text;
  subscription_valid boolean;
begin
  perform private.ss_assert(auth.uid() is not null, 'Sign in to continue');

  select * into member_row
  from public.smartsell_members
  where id = auth.uid() and active = 1 and account_status = 'active';
  perform private.ss_assert(
    found,
    'No active Smartsell membership. Sign in and finish business setup.'
  );

  select * into business_row
  from public.smartsell_businesses b
  where b.id = member_row.business_id;
  perform private.ss_assert(
    business_row.account_status = 'active',
    'This business account has been suspended. Contact platform support.'
  );

  if business_row.subscription_enforced then
    select r.status into review_status
    from private.smartsell_platform_business_reviews r
    where r.business_id = business_row.id;

    perform private.ss_assert(
      review_status = 'approved',
      'Your business application is awaiting approval.'
    );

    select exists (
      select 1
      from private.smartsell_subscriptions s
      join private.smartsell_subscription_plans p on p.id = s.plan_id
      where s.business_id = business_row.id
        and s.status in ('trialing', 'active')
        and s.starts_at <= now()
        and s.current_period_start <= now()
        and s.current_period_end > now()
        and (
          (s.status = 'trialing' and p.amount = 0
            and s.trial_end is not null and s.trial_end > now())
          or
          (s.status = 'active' and exists (
            select 1
            from private.smartsell_subscription_payments payment
            where payment.subscription_id = s.id
              and payment.business_id = business_row.id
              and payment.status = 'paid'
              and payment.verified_at is not null
          ))
        )
    ) into subscription_valid;

    perform private.ss_assert(
      subscription_valid,
      'Your subscription is not active. Review your account status to continue.'
    );
  end if;

  return member_row;
end
$$;

revoke all on function private.ss_member() from public, anon, authenticated;
grant execute on function private.ss_member() to authenticated;

create or replace function private.smartsell_onboard(v jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  biz uuid := gen_random_uuid();
  br uuid := gen_random_uuid();
  identity jsonb;
  email text;
  category text := coalesce(v->>'category', 'Retail');
  custom_category text := coalesce(v->>'custom_category', '');
  selected_plan uuid := nullif(v->>'selected_plan_id', '')::uuid;
  plan_row private.smartsell_subscription_plans;
  subscription_id uuid;
begin
  identity := private.smartsell_identity();
  if identity is not null then
    return identity;
  end if;

  perform private.ss_assert(auth.uid() is not null, 'Sign in to continue');
  perform private.ss_assert(
    selected_plan is not null,
    'Choose a subscription plan before completing business setup.'
  );
  select * into plan_row
  from private.smartsell_subscription_plans p
  where p.id = selected_plan and p.active;
  perform private.ss_assert(found, 'The selected subscription plan is unavailable.');

  perform private.ss_assert(
    exists (select 1 from pg_timezone_names where name = v->>'timezone'),
    'Invalid timezone'
  );
  perform private.ss_assert(
    coalesce(v->>'currency', 'TZS') ~ '^[A-Z]{3}$',
    'Currency must be a three-letter ISO code'
  );
  perform private.ss_assert(
    category in (
      'Retail', 'Grocery', 'Fashion', 'Electronics', 'Restaurant',
      'Pharmacy', 'Beauty & Personal Care', 'Hardware', 'Other'
    ),
    'Invalid business category'
  );
  perform private.ss_assert(
    category <> 'Other' or length(custom_category) > 0,
    'Enter your business category'
  );
  perform private.ss_assert(
    length(btrim(coalesce(v->>'region', ''))) between 1 and 150
      and length(coalesce(v->>'registration_number', '')) <= 150,
    'Enter a region and a valid registration number.'
  );

  select u.email into email from auth.users u where u.id = auth.uid();
  insert into public.smartsell_businesses (
    id, name, currency, country, timezone, category, custom_category,
    email, phone, address, region, registration_number, subscription_enforced
  ) values (
    biz,
    private.ss_text(v, 'business'),
    coalesce(v->>'currency', 'TZS'),
    private.ss_text(v, 'country'),
    v->>'timezone',
    category,
    custom_category,
    coalesce(email, ''),
    coalesce(v->>'phone', ''),
    coalesce(v->>'address', ''),
    btrim(v->>'region'),
    coalesce(v->>'registration_number', ''),
    true
  );
  insert into public.smartsell_branches(id, business_id, name)
  values (br, biz, coalesce(nullif(btrim(v->>'branch'), ''), 'Main branch'));
  insert into public.smartsell_members(id, business_id, branch_id, name, email, role)
  values (auth.uid(), biz, br, private.ss_text(v, 'name'), email, 'owner');

  update private.smartsell_platform_business_reviews
  set selected_plan_id = plan_row.id,
      region = btrim(v->>'region'),
      registration_number = coalesce(v->>'registration_number', ''),
      updated_at = now()
  where business_id = biz;

  insert into private.smartsell_subscriptions (
    business_id, plan_id, status, billing_interval, amount, currency,
    starts_at, current_period_start, current_period_end, created_by
  ) values (
    biz, plan_row.id, 'pending_approval', plan_row.billing_interval,
    plan_row.amount, plan_row.currency, now(), now(), now() + interval '1 second',
    auth.uid()
  ) returning id into subscription_id;

  return private.smartsell_identity();
end
$$;

create or replace function private.smartsell_identity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_row public.smartsell_members;
  invitation public.smartsell_invitations;
  business_status text;
  business_reason text;
  platform_admin boolean;
  review_row private.smartsell_platform_business_reviews;
  subscription_row private.smartsell_subscriptions;
  plan_row private.smartsell_subscription_plans;
begin
  perform private.ss_assert(auth.uid() is not null, 'Sign in to continue');
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 1));

  select * into member_row
  from public.smartsell_members
  where id = auth.uid();

  if not found then
    select i.* into invitation
    from public.smartsell_invitations i
    join auth.users u on lower(u.email) = lower(i.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null;

    if found then
      insert into public.smartsell_members (
        id, business_id, branch_id, name, email, role, account_status
      ) values (
        auth.uid(), invitation.business_id, invitation.branch_id,
        invitation.name, invitation.email, invitation.role,
        invitation.account_status
      ) returning * into member_row;
      delete from public.smartsell_invitations where id = invitation.id;
    end if;
  end if;

  if member_row.id is null then
    return null;
  end if;

  perform private.ss_assert(
    member_row.active = 1,
    'Your Smartsell membership is disabled'
  );

  select b.account_status, b.suspension_reason
    into business_status, business_reason
  from public.smartsell_businesses b
  where b.id = member_row.business_id;

  select exists (
    select 1
    from private.smartsell_platform_admins a
    where a.user_id = auth.uid() and a.active
  ) into platform_admin;

  select * into review_row
  from private.smartsell_platform_business_reviews r
  where r.business_id = member_row.business_id;

  select * into subscription_row
  from private.smartsell_subscriptions s
  where s.business_id = member_row.business_id
  order by s.created_at desc
  limit 1;

  if subscription_row.id is not null then
    select * into plan_row
    from private.smartsell_subscription_plans p
    where p.id = subscription_row.plan_id;
  end if;

  return to_jsonb(member_row) || jsonb_build_object(
    'account_status', business_status,
    'suspension_reason', business_reason,
    'is_admin', platform_admin,
    'member_status', member_row.account_status,
    'access_expired', member_row.expires_at is not null
      and member_row.expires_at < current_date,
    'expires_at', member_row.expires_at,
    'must_change_password', member_row.must_change_password,
    'business_review_status', coalesce(review_row.status, 'unreviewed'),
    'selected_plan_id', review_row.selected_plan_id,
    'registration_number', review_row.registration_number,
    'subscription_enforced', (
      select b.subscription_enforced from public.smartsell_businesses b
      where b.id = member_row.business_id
    ),
    'subscription_status', subscription_row.status,
    'subscription_id', subscription_row.id,
    'subscription_plan', plan_row.name,
    'subscription_amount', subscription_row.amount,
    'subscription_currency', subscription_row.currency,
    'subscription_period_end', subscription_row.current_period_end,
    'trial_end', subscription_row.trial_end
  );
end
$$;

create or replace function private.smartsell_subscription_portal(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  action text := coalesce(command->>'action', 'status');
  member_row public.smartsell_members;
  business_row public.smartsell_businesses;
  review_row private.smartsell_platform_business_reviews;
  plan_row private.smartsell_subscription_plans;
  subscription_row private.smartsell_subscriptions;
  payment_id uuid;
  plan_id uuid := nullif(command->>'plan_id', '')::uuid;
  payment_method text := coalesce(command->>'method', 'manual');
  payment_reference text := nullif(btrim(command->>'external_reference'), '');
  evidence text := nullif(btrim(command->>'evidence_path'), '');
  payment_note text := coalesce(command->>'note', '');
  instructions jsonb;
begin
  if actor_id is null then
    raise exception 'Sign in to continue' using errcode = '42501';
  end if;

  select * into member_row
  from public.smartsell_members m
  where m.id = actor_id and m.active = 1 and m.account_status = 'active';
  if not found then
    raise exception 'Active business membership required' using errcode = '42501';
  end if;

  select * into business_row
  from public.smartsell_businesses b
  where b.id = member_row.business_id;
  if business_row.account_status <> 'active' then
    raise exception 'This business account is suspended' using errcode = '42501';
  end if;

  select * into review_row
  from private.smartsell_platform_business_reviews r
  where r.business_id = business_row.id;

  if action not in (
    'status', 'select_plan', 'submit_payment', 'submit_documents'
  ) then
    raise exception 'Unsupported subscription portal action' using errcode = '22023';
  end if;

  if action = 'select_plan' then
    if review_row.status <> 'approved' then
      raise exception 'Your business must be approved before selecting a renewal plan'
        using errcode = '22023';
    end if;

    select * into plan_row
    from private.smartsell_subscription_plans p
    where p.id = plan_id and p.active;
    if not found then
      raise exception 'Choose an available subscription plan' using errcode = '22023';
    end if;
    if exists (
      select 1
      from private.smartsell_subscriptions s
      where s.business_id = business_row.id
        and s.status in ('trialing', 'active')
        and s.current_period_end > now()
        and s.starts_at <= now()
    ) then
      raise exception 'Your current subscription is still active.'
        using errcode = '22023';
    end if;

    if plan_row.amount = 0 and exists (
      select 1
      from private.smartsell_subscriptions s
      join private.smartsell_subscription_plans prior_plan on prior_plan.id = s.plan_id
      where s.business_id = business_row.id and prior_plan.amount = 0
    ) then
      raise exception 'The free trial can only be used once. Choose a paid plan to renew.'
        using errcode = '22023';
    end if;

    update private.smartsell_subscriptions
    set status = 'canceled', canceled_at = now(), cancel_at_period_end = false
    where business_id = business_row.id
      and status in (
        'pending_approval', 'awaiting_payment', 'payment_submitted',
        'payment_review', 'payment_rejected', 'trialing', 'active', 'past_due',
        'suspended'
      );

    insert into private.smartsell_subscriptions (
      business_id, plan_id, status, billing_interval, amount, currency,
      starts_at, current_period_start, current_period_end, created_by
    ) values (
      business_row.id, plan_row.id, 'awaiting_payment', plan_row.billing_interval,
      plan_row.amount, plan_row.currency, now(), now(), now() + interval '1 second',
      actor_id
    ) returning * into subscription_row;

    update private.smartsell_platform_business_reviews
    set selected_plan_id = plan_row.id, updated_at = now()
    where business_id = business_row.id;

    return jsonb_build_object(
      'ok', true, 'subscription_id', subscription_row.id,
      'status', subscription_row.status
    );
  end if;

  if action = 'submit_payment' then
    if review_row.status <> 'approved' then
      raise exception 'Your business must be approved before submitting payment'
        using errcode = '22023';
    end if;
    if payment_method not in ('manual', 'cash', 'bank_transfer', 'mobile_money', 'other')
      or payment_reference is null
      or length(payment_reference) > 200
      or evidence is null
      or payment_note = '' or length(payment_note) > 1000 then
      raise exception 'Enter payment method, reference, evidence, and notes'
        using errcode = '22023';
    end if;
    if split_part(evidence, '/', 1) <> actor_id::text
      or split_part(evidence, '/', 2) <> business_row.id::text then
      raise exception 'Payment evidence path does not match your business'
        using errcode = '42501';
    end if;

    select s.* into subscription_row
    from private.smartsell_subscriptions s
    where s.business_id = business_row.id
      and s.status in ('awaiting_payment', 'payment_rejected', 'expired', 'past_due')
    order by s.created_at desc
    limit 1
    for update;
    if not found then
      raise exception 'No subscription is currently awaiting payment'
        using errcode = '22023';
    end if;
    if subscription_row.amount < 1 then
      raise exception 'A zero-cost plan does not require payment'
        using errcode = '22023';
    end if;

    select * into plan_row
    from private.smartsell_subscription_plans p
    where p.id = subscription_row.plan_id;
    if not found or subscription_row.amount <> plan_row.amount
      or subscription_row.currency <> plan_row.currency then
      raise exception 'Subscription amount no longer matches the configured plan'
        using errcode = '22023';
    end if;

    select setting_value into instructions
    from private.smartsell_platform_settings
    where setting_key = 'payment_instructions';
    if instructions is null or instructions = 'null'::jsonb
      or instructions = '{}'::jsonb then
      raise exception 'Payment instructions are not configured. Contact platform support.'
        using errcode = '22023';
    end if;
    if coalesce(jsonb_typeof(instructions->'methods'), '') <> 'array'
      or not coalesce(instructions->'methods' ? payment_method, false) then
      raise exception 'This payment method is not currently enabled'
        using errcode = '22023';
    end if;

    insert into private.smartsell_subscription_payments (
      subscription_id, business_id, amount, currency, status, method,
      external_reference, note, recorded_by, evidence_path
    ) values (
      subscription_row.id, business_row.id, subscription_row.amount,
      subscription_row.currency, 'pending', payment_method,
      payment_reference, payment_note, actor_id, evidence
    ) returning id into payment_id;

    update private.smartsell_subscriptions
    set status = 'payment_submitted'
    where id = subscription_row.id;

    insert into private.smartsell_payment_review_events (
      payment_id, decision, reason
    ) values (payment_id, 'submitted', 'Payment evidence submitted by business owner');

    insert into public.smartsell_events (
      business_id, actor_id, category, entity, description, reference
    ) values (
      business_row.id, actor_id, 'Subscription Payment', business_row.name,
      'Subscription payment submitted and awaiting administrator verification',
      payment_id::text
    );

    return jsonb_build_object('ok', true, 'payment_id', payment_id, 'status', 'pending');
  end if;

  if action = 'submit_documents' then
    if review_row.status not in ('pending', 'under_review', 'needs_documents') then
      raise exception 'Business documents can only be submitted while the application is under review'
        using errcode = '22023';
    end if;
    if coalesce(jsonb_typeof(command->'documents'), '') <> 'array'
      or coalesce(jsonb_array_length(command->'documents'), 0) not between 1 and 10
      or exists (
        select 1
        from jsonb_array_elements_text(command->'documents') as docs(path)
        where split_part(docs.path, '/', 1) <> actor_id::text
          or split_part(docs.path, '/', 2) <> business_row.id::text
      ) then
      raise exception 'Upload one or more valid business documents'
        using errcode = '22023';
    end if;

    update private.smartsell_platform_business_reviews
    set documents = command->'documents', updated_at = now()
    where business_id = business_row.id;

    insert into public.smartsell_events (
      business_id, actor_id, category, entity, description, reference
    ) values (
      business_row.id, actor_id, 'Business Application', business_row.name,
      'Business documents submitted for platform review', business_row.id::text
    );
    return jsonb_build_object('ok', true, 'documents', command->'documents');
  end if;

  select setting_value into instructions
  from private.smartsell_platform_settings
  where setting_key = 'payment_instructions';

  return jsonb_build_object(
    'business_review_status', review_row.status,
    'selected_plan_id', review_row.selected_plan_id,
    'documents', review_row.documents,
    'subscription', (
      select to_jsonb(s) || jsonb_build_object('plan_name', p.name)
      from private.smartsell_subscriptions s
      join private.smartsell_subscription_plans p on p.id = s.plan_id
      where s.business_id = business_row.id
      order by s.created_at desc limit 1
    ),
    'payment_instructions', coalesce(instructions, '{}'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.submitted_at desc)
      from (
        select id, subscription_id, amount, currency, status, method,
          external_reference, note, submitted_at, verified_at,
          rejection_reason
        from private.smartsell_subscription_payments p
        where p.business_id = business_row.id
        order by p.submitted_at desc
        limit 50
      ) rows
    ), '[]'::jsonb),
    'free_trial_used', exists (
      select 1
      from private.smartsell_subscriptions s
      join private.smartsell_subscription_plans p on p.id = s.plan_id
      where s.business_id = business_row.id and p.amount = 0
    ),
    'review_events', coalesce((
      select jsonb_agg(to_jsonb(rows) order by rows.created_at desc)
      from (
        select event.decision, event.reason, event.created_at
        from private.smartsell_payment_review_events event
        join private.smartsell_subscription_payments payment
          on payment.id = event.payment_id
        where payment.business_id = business_row.id
        order by event.created_at desc
        limit 50
      ) rows
    ), '[]'::jsonb)
  );
end
$$;

create or replace function public.smartsell_subscription_portal(command jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.smartsell_subscription_portal(command);
$$;

revoke all on function private.smartsell_subscription_portal(jsonb)
  from public, anon, authenticated;
revoke all on function public.smartsell_subscription_portal(jsonb)
  from public, anon, authenticated;
grant execute on function private.smartsell_subscription_portal(jsonb) to authenticated;
grant execute on function public.smartsell_subscription_portal(jsonb) to authenticated;

create or replace function private.smartsell_platform_payment_reviews(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := auth.uid();
  action text := coalesce(command->>'action', 'list');
  payment_id uuid := nullif(command->>'payment_id', '')::uuid;
  target_plan_id uuid := nullif(command->>'plan_id', '')::uuid;
  decision_reason text := btrim(coalesce(command->>'reason', ''));
  payment_row private.smartsell_subscription_payments;
  plan_row private.smartsell_subscription_plans;
begin
  if admin_id is null or not exists (
    select 1 from private.smartsell_platform_admins a
    where a.user_id = admin_id and a.active
  ) then
    raise exception 'Platform admin access required' using errcode = '42501';
  end if;

  if action not in (
    'list', 'verify', 'reject', 'request_information',
    'payment_instructions_get', 'payment_instructions_save',
    'applications', 'entitlements_get', 'entitlements_save'
  ) then
    raise exception 'Unsupported payment review action' using errcode = '22023';
  end if;

  if action = 'payment_instructions_get' then
    return jsonb_build_object(
      'payment_instructions', coalesce((
        select setting_value
        from private.smartsell_platform_settings
        where setting_key = 'payment_instructions'
      ), '{}'::jsonb)
    );
  end if;

  if action = 'payment_instructions_save' then
    if jsonb_typeof(command->'payment_instructions') <> 'object'
      or command->'payment_instructions' = '{}'::jsonb
      or coalesce(jsonb_typeof(command->'payment_instructions'->'methods'), '') <> 'array'
      or jsonb_array_length(command->'payment_instructions'->'methods') = 0
      or exists (
        select 1
        from jsonb_array_elements_text(
          command->'payment_instructions'->'methods'
        ) as methods(method)
        where methods.method not in (
          'manual', 'cash', 'bank_transfer', 'mobile_money', 'other'
        )
      ) then
      raise exception 'Enter payment instructions and at least one supported method'
        using errcode = '22023';
    end if;
    insert into private.smartsell_platform_settings (
      setting_key, setting_value, updated_by
    ) values (
      'payment_instructions', command->'payment_instructions', admin_id
    )
    on conflict (setting_key) do update
      set setting_value = excluded.setting_value,
          updated_by = excluded.updated_by,
          updated_at = now();
    return jsonb_build_object('ok', true);
  end if;

  if action = 'applications' then
    return jsonb_build_object(
      'applications', coalesce((
        select jsonb_agg(to_jsonb(rows) order by rows.created_at desc)
        from (
          select business.id as business_id, business.name as business_name,
            business.category, business.custom_category, business.country,
            business.region, business.address, business.registration_number,
            review.status, review.reason, review.documents,
            review.selected_plan_id, plan.name as plan_name,
            review.created_at, review.updated_at,
            owner.name as owner_name, owner.email as owner_email
          from private.smartsell_platform_business_reviews review
          join public.smartsell_businesses business
            on business.id = review.business_id
          left join private.smartsell_subscription_plans plan
            on plan.id = review.selected_plan_id
          left join lateral (
            select member.name, member.email
            from public.smartsell_members member
            where member.business_id = business.id and member.role = 'owner'
            order by member.created_at limit 1
          ) owner on true
          order by review.created_at desc
          limit 250
        ) rows
      ), '[]'::jsonb)
    );
  end if;

  if action in ('entitlements_get', 'entitlements_save') then
    if target_plan_id is null then
      raise exception 'Choose a plan to manage its entitlements'
        using errcode = '22023';
    end if;
    select * into plan_row
    from private.smartsell_subscription_plans p
    where p.id = target_plan_id;
    if not found then
      raise exception 'Subscription plan not found' using errcode = 'P0002';
    end if;

    if action = 'entitlements_get' then
      return jsonb_build_object(
        'plan_id', target_plan_id,
        'entitlements', coalesce((
          select jsonb_agg(jsonb_build_object(
            'feature_key', entitlement.feature_key,
            'label', entitlement.label,
            'limit_value', entitlement.limit_value,
            'enabled', entitlement.enabled
          ) order by entitlement.label)
          from private.smartsell_plan_entitlements entitlement
          where entitlement.plan_id = target_plan_id
        ), '[]'::jsonb)
      );
    end if;

    if coalesce(jsonb_typeof(command->'entitlements'), '') <> 'array'
      or coalesce(jsonb_array_length(command->'entitlements'), 101) > 100
      or exists (
        select 1
        from jsonb_to_recordset(command->'entitlements') as entitlement(
          feature_key text, label text, limit_value bigint, enabled boolean
        )
        where length(btrim(coalesce(entitlement.feature_key, ''))) not between 1 and 100
          or length(btrim(coalesce(entitlement.label, ''))) not between 1 and 150
          or (entitlement.limit_value is not null and entitlement.limit_value < 0)
          or entitlement.enabled is null
      ) then
      raise exception 'Enter valid entitlement feature names, labels, limits, and availability'
        using errcode = '22023';
    end if;

    delete from private.smartsell_plan_entitlements
    where plan_id = target_plan_id;

    insert into private.smartsell_plan_entitlements (
      plan_id, feature_key, label, limit_value, enabled
    )
    select target_plan_id, btrim(entitlement.feature_key),
      btrim(entitlement.label), entitlement.limit_value, entitlement.enabled
    from jsonb_to_recordset(command->'entitlements') as entitlement(
      feature_key text, label text, limit_value bigint, enabled boolean
    );

    insert into public.smartsell_events (
      actor_id, category, entity, description, reference
    ) values (
      admin_id, 'Platform Billing', plan_row.name,
      'Plan entitlements updated', plan_row.id::text
    );
    return jsonb_build_object('ok', true, 'plan_id', target_plan_id);
  end if;

  if action = 'list' then
    return jsonb_build_object(
      'payments', coalesce((
        select jsonb_agg(to_jsonb(rows) order by rows.submitted_at desc)
        from (
          select payment.id, payment.subscription_id, payment.business_id,
            business.name as business_name, owner.name as owner_name,
            owner.email as owner_email, plan.name as plan_name,
            payment.amount, payment.currency, payment.method,
            payment.external_reference, payment.evidence_path,
            payment.status, payment.note, payment.submitted_at,
            payment.verified_at, payment.reviewed_by,
            payment.rejection_reason
          from private.smartsell_subscription_payments payment
          join public.smartsell_businesses business on business.id = payment.business_id
          join private.smartsell_subscriptions subscription
            on subscription.id = payment.subscription_id
          join private.smartsell_subscription_plans plan on plan.id = subscription.plan_id
          left join lateral (
            select m.name, m.email
            from public.smartsell_members m
            where m.business_id = business.id and m.role = 'owner'
            order by m.created_at limit 1
          ) owner on true
          order by payment.submitted_at desc
          limit 500
        ) rows
      ), '[]'::jsonb)
    );
  end if;

  if payment_id is null then
    raise exception 'Choose a payment record' using errcode = '22023';
  end if;
  if action in ('reject', 'request_information')
    and length(decision_reason) not between 1 and 2000 then
    raise exception 'Provide a reason for this payment decision'
      using errcode = '22023';
  end if;

  select * into payment_row
  from private.smartsell_subscription_payments p
  where p.id = payment_id
  for update;
  if not found then
    raise exception 'Payment record not found' using errcode = 'P0002';
  end if;
  if payment_row.status <> 'pending' then
    raise exception 'This payment has already been reviewed'
      using errcode = '22023';
  end if;

  if action = 'verify' then
    if nullif(btrim(coalesce(command->>'confirmation', '')), '') is null
      or nullif(payment_row.external_reference, '') is null then
      raise exception 'Confirm that the external payment was received and has a reference'
        using errcode = '22023';
    end if;
    update private.smartsell_subscription_payments
    set status = 'paid', verified_at = now(), reviewed_by = admin_id
    where id = payment_row.id;
    insert into private.smartsell_payment_review_events (
      payment_id, reviewer_id, decision, reason
    ) values (
      payment_row.id, admin_id, 'verified',
      btrim(command->>'confirmation')
    );
  elsif action = 'reject' then
    update private.smartsell_subscription_payments
    set status = 'failed', reviewed_by = admin_id, rejection_reason = decision_reason
    where id = payment_row.id;
    update private.smartsell_subscriptions
    set status = 'payment_rejected'
    where id = payment_row.subscription_id
      and status = 'payment_submitted';
    insert into private.smartsell_payment_review_events (
      payment_id, reviewer_id, decision, reason
    ) values (payment_row.id, admin_id, 'rejected', decision_reason);
  else
    insert into private.smartsell_payment_review_events (
      payment_id, reviewer_id, decision, reason
    ) values (payment_row.id, admin_id, 'information_requested', decision_reason);
  end if;

  insert into public.smartsell_events (
    business_id, actor_id, category, entity, description, reference
  )
  select payment_row.business_id, admin_id, 'Subscription Payment',
    business.name,
    case action
      when 'verify' then 'Subscription payment verified by platform administrator'
      when 'reject' then 'Subscription payment rejected: ' || decision_reason
      else 'Additional payment information requested: ' || decision_reason
    end,
    payment_row.id::text
  from public.smartsell_businesses business
  where business.id = payment_row.business_id;

  return jsonb_build_object(
    'ok', true, 'payment_id', payment_row.id,
    'status', case action
      when 'verify' then 'paid'
      when 'reject' then 'failed'
      else 'pending'
    end
  );
end
$$;

create or replace function public.smartsell_platform_payment_reviews(command jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.smartsell_platform_payment_reviews(command);
$$;

revoke all on function private.smartsell_platform_payment_reviews(jsonb)
  from public, anon, authenticated;
revoke all on function public.smartsell_platform_payment_reviews(jsonb)
  from public, anon, authenticated;
grant execute on function private.smartsell_platform_payment_reviews(jsonb)
  to authenticated;
grant execute on function public.smartsell_platform_payment_reviews(jsonb)
  to authenticated;