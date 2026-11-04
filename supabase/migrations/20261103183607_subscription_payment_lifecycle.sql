create or replace function private.smartsell_subscription_payment_effect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := auth.uid();
  subscription_row private.smartsell_subscriptions;
  next_period_start timestamptz;
begin
  if admin_id is null or not exists (
    select 1
    from private.smartsell_platform_admins a
    where a.user_id = admin_id and a.active
  ) then
    raise exception 'Platform admin access required'
      using errcode = '42501';
  end if;

  if new.status = 'paid' then
    select * into subscription_row
    from private.smartsell_subscriptions s
    where s.id = new.subscription_id
    for update;

    if not found
      or subscription_row.status not in ('trialing', 'active', 'past_due') then
      raise exception 'Only current subscriptions can be renewed by a verified payment'
        using errcode = '22023';
    end if;

    if new.currency <> subscription_row.currency
      or new.amount < subscription_row.amount then
      raise exception 'A verified payment must cover the subscription price in its billing currency'
        using errcode = '22023';
    end if;

    next_period_start := case
      when subscription_row.status = 'trialing' then now()
      else greatest(subscription_row.current_period_end, now())
    end;

    update private.smartsell_subscriptions
    set status = 'active',
      trial_end = null,
      current_period_start = next_period_start,
      current_period_end = case billing_interval
        when 'year' then next_period_start + interval '1 year'
        else next_period_start + interval '1 month'
      end
    where id = new.subscription_id;
  elsif new.status in ('failed', 'refunded') then
    update private.smartsell_subscriptions
    set status = 'past_due'
    where id = new.subscription_id
      and status in ('trialing', 'active', 'past_due');
  end if;

  return new;
end
$$;

revoke all on function private.smartsell_subscription_payment_effect()
  from public, anon, authenticated;

create trigger smartsell_subscription_payment_effect
before insert on private.smartsell_subscription_payments
for each row execute function private.smartsell_subscription_payment_effect();