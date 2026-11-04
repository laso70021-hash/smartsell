create table private.smartsell_tenant_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  requested_by uuid not null references auth.users(id),
  member_ids uuid[] not null default '{}',
  login_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create unique index smartsell_tenant_deletion_jobs_business
  on private.smartsell_tenant_deletion_jobs (business_id);

alter table private.smartsell_tenant_deletion_jobs enable row level security;
revoke all on table private.smartsell_tenant_deletion_jobs
  from public, anon, authenticated;

create function private.smartsell_team_delete_prepare(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_row public.smartsell_members := private.ss_member();
  target public.smartsell_members;
  target_id uuid := nullif(command->>'member_id', '')::uuid;
begin
  perform private.ss_assert(member_row.role = 'owner', 'Owner permission required');
  perform private.ss_assert(command->>'confirmation' = 'DELETE',
    'Type DELETE to confirm permanent team member removal');

  select * into target
  from public.smartsell_members
  where id = target_id
    and business_id = member_row.business_id
    and role <> 'owner'
  for update;
  perform private.ss_assert(found, 'Team member not found');

  update public.smartsell_members
  set active = 0, account_status = 'suspended'
  where id = target.id;

  return jsonb_build_object('member_id', target.id, 'prepared', true);
end
$$;

revoke all on function private.smartsell_team_delete_prepare(jsonb)
  from public, anon, authenticated;
grant execute on function private.smartsell_team_delete_prepare(jsonb)
  to authenticated;

create function public.smartsell_team_delete_prepare(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.smartsell_team_delete_prepare(command);
$$;

revoke all on function public.smartsell_team_delete_prepare(jsonb)
  from public, anon;
grant execute on function public.smartsell_team_delete_prepare(jsonb)
  to authenticated;

create function private.smartsell_platform_tenant_delete_prepare(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := auth.uid();
  target_business_id uuid := nullif(command->>'business_id', '')::uuid;
  business_row public.smartsell_businesses;
  deletion_job private.smartsell_tenant_deletion_jobs;
  target_members uuid[];
  target_logins uuid[];
begin
  if admin_id is null or not exists (
    select 1 from private.smartsell_platform_admins a
    where a.user_id = admin_id and a.active
  ) then
    raise exception 'Platform admin access required' using errcode = '42501';
  end if;

  if target_business_id is null then
    raise exception 'Choose a business to delete' using errcode = '22023';
  end if;

  select * into business_row
  from public.smartsell_businesses b
  where b.id = target_business_id
  for update;
  if not found then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;
  if coalesce(command->>'confirmation', '') <> business_row.name then
    raise exception 'Business name did not match; deletion was canceled'
      using errcode = '22023';
  end if;

  select * into deletion_job
  from private.smartsell_tenant_deletion_jobs j
  where j.business_id = target_business_id
  for update;
  if not found then
    select coalesce(array_agg(m.id), '{}')
    into target_members
    from public.smartsell_members m
    where m.business_id = target_business_id;

    select coalesce(array_agg(m.id), '{}')
    into target_logins
    from public.smartsell_members m
    where m.business_id = target_business_id
      and not exists (
        select 1 from private.smartsell_platform_admins a
        where a.user_id = m.id and a.active
      );

    insert into private.smartsell_tenant_deletion_jobs (
      business_id, requested_by, member_ids, login_ids
    ) values (
      target_business_id, admin_id, target_members, target_logins
    ) returning * into deletion_job;

    update public.smartsell_businesses
    set account_status = 'suspended',
        suspension_reason = 'Permanent deletion in progress',
        suspended_at = now(),
        suspended_by = admin_id
    where id = target_business_id;

    update public.smartsell_members
    set active = 0, account_status = 'suspended'
    where business_id = target_business_id;
  end if;

  return jsonb_build_object(
    'job_id', deletion_job.id,
    'business_id', deletion_job.business_id,
    'member_ids', to_jsonb(deletion_job.member_ids),
    'login_ids', to_jsonb(deletion_job.login_ids)
  );
end
$$;

revoke all on function private.smartsell_platform_tenant_delete_prepare(jsonb)
  from public, anon, authenticated;
grant execute on function private.smartsell_platform_tenant_delete_prepare(jsonb)
  to authenticated;

create function public.smartsell_platform_tenant_delete_prepare(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.smartsell_platform_tenant_delete_prepare(command);
$$;

revoke all on function public.smartsell_platform_tenant_delete_prepare(jsonb)
  from public, anon;
grant execute on function public.smartsell_platform_tenant_delete_prepare(jsonb)
  to authenticated;

create function private.smartsell_platform_tenant_delete_finalize(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := auth.uid();
  deletion_job private.smartsell_tenant_deletion_jobs;
  target_business_id uuid;
begin
  if admin_id is null or not exists (
    select 1 from private.smartsell_platform_admins a
    where a.user_id = admin_id and a.active
  ) then
    raise exception 'Platform admin access required' using errcode = '42501';
  end if;

  select * into deletion_job
  from private.smartsell_tenant_deletion_jobs j
  where j.id = nullif(command->>'job_id', '')::uuid
  for update;
  if not found then
    raise exception 'Tenant deletion request not found' using errcode = 'P0002';
  end if;
  target_business_id := deletion_job.business_id;

  if not exists (
    select 1 from public.smartsell_businesses b
    where b.id = target_business_id and b.account_status = 'suspended'
  ) then
    raise exception 'Tenant must remain suspended during deletion'
      using errcode = '22023';
  end if;

  delete from private.smartsell_platform_support_messages message
  using private.smartsell_platform_support_tickets ticket
  where message.ticket_id = ticket.id
    and ticket.business_id = target_business_id;
  delete from private.smartsell_platform_support_tickets
  where business_id = target_business_id;

  if to_regclass('private.smartsell_payment_review_events') is not null then
    execute '
      delete from private.smartsell_payment_review_events event
      using private.smartsell_subscription_payments payment
      where event.payment_id = payment.id and payment.business_id = $1'
      using target_business_id;
  end if;
  if to_regclass('private.smartsell_billing_ledger') is not null then
    execute 'delete from private.smartsell_billing_ledger where business_id = $1'
      using target_business_id;
  end if;
  delete from private.smartsell_subscription_payments
  where business_id = target_business_id;
  delete from private.smartsell_subscriptions
  where business_id = target_business_id;

  delete from public.smartsell_restaurant_order_items
  where business_id = target_business_id;
  delete from public.smartsell_restaurant_orders
  where business_id = target_business_id;
  delete from public.smartsell_sale_items
  where business_id = target_business_id;
  delete from public.smartsell_sales
  where business_id = target_business_id;
  delete from public.smartsell_purchases
  where business_id = target_business_id;
  delete from public.smartsell_cashier_shifts
  where business_id = target_business_id;
  delete from public.smartsell_stock
  where business_id = target_business_id;
  delete from public.smartsell_movements
  where business_id = target_business_id;
  delete from public.smartsell_expenses
  where business_id = target_business_id;
  delete from public.smartsell_events
  where business_id = target_business_id;
  delete from public.smartsell_operations
  where business_id = target_business_id;
  delete from public.smartsell_exports
  where business_id = target_business_id;
  delete from public.smartsell_dining_tables
  where business_id = target_business_id;
  delete from public.smartsell_kitchen_stations
  where business_id = target_business_id;
  delete from public.smartsell_document_templates
  where business_id = target_business_id;
  delete from public.smartsell_invitations
  where business_id = target_business_id;
  delete from public.smartsell_members
  where business_id = target_business_id;
  delete from public.smartsell_product_images
  where business_id = target_business_id;
  delete from public.smartsell_products
  where business_id = target_business_id;
  delete from public.smartsell_parties
  where business_id = target_business_id;
  delete from public.smartsell_branches
  where business_id = target_business_id;
  delete from public.smartsell_businesses
  where id = target_business_id;

  delete from private.smartsell_tenant_deletion_jobs
  where id = deletion_job.id;

  return jsonb_build_object(
    'ok', true,
    'business_id', target_business_id,
    'deleted_member_count', cardinality(deletion_job.member_ids)
  );
end
$$;

revoke all on function private.smartsell_platform_tenant_delete_finalize(jsonb)
  from public, anon, authenticated;
grant execute on function private.smartsell_platform_tenant_delete_finalize(jsonb)
  to authenticated;

create function public.smartsell_platform_tenant_delete_finalize(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.smartsell_platform_tenant_delete_finalize(command);
$$;

revoke all on function public.smartsell_platform_tenant_delete_finalize(jsonb)
  from public, anon;
grant execute on function public.smartsell_platform_tenant_delete_finalize(jsonb)
  to authenticated;