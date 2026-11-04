alter table public.smartsell_businesses
  add column account_status text not null default 'active',
  add column suspension_reason text not null default '',
  add column suspended_at timestamptz,
  add column suspended_by uuid references auth.users(id);

alter table public.smartsell_businesses
  add constraint smartsell_businesses_account_status_check
  check (account_status in ('active', 'suspended'));

create index smartsell_businesses_suspended_by_idx
  on public.smartsell_businesses (suspended_by)
  where suspended_by is not null;

create or replace function private.ss_member()
returns public.smartsell_members
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  member_row public.smartsell_members;
  business_status text;
begin
  perform private.ss_assert(auth.uid() is not null, 'Sign in to continue');

  select * into member_row
  from public.smartsell_members
  where id = auth.uid() and active = 1;
  perform private.ss_assert(
    found,
    'No active Smartsell membership. Sign in and finish business setup.'
  );

  select b.account_status into business_status
  from public.smartsell_businesses b
  where b.id = member_row.business_id;
  perform private.ss_assert(
    business_status = 'active',
    'This business account has been suspended. Contact platform support.'
  );

  return member_row;
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
        id, business_id, branch_id, name, email, role
      ) values (
        auth.uid(), invitation.business_id, invitation.branch_id,
        invitation.name, invitation.email, invitation.role
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

  return to_jsonb(member_row) || jsonb_build_object(
    'account_status', business_status,
    'suspension_reason', business_reason,
    'is_admin', platform_admin
  );
end
$$;

create or replace function private.smartsell_platform_business(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := auth.uid();
  requested_action text := coalesce(command->>'action', 'list');
  target_business_id uuid;
  target_status text;
  target_reason text;
  business_row public.smartsell_businesses;
  requested_search text := nullif(btrim(command->>'search'), '');
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

  if requested_action not in ('list', 'set_status') then
    raise exception 'Unsupported business management action'
      using errcode = '22023';
  end if;

  if requested_action = 'set_status' then
    target_business_id := nullif(command->>'business_id', '')::uuid;
    target_status := coalesce(command->>'account_status', '');
    target_reason := coalesce(command->>'suspension_reason', '');

    if target_business_id is null
      or target_status not in ('active', 'suspended')
      or length(target_reason) > 2000 then
      raise exception 'Enter a valid business status and suspension reason'
        using errcode = '22023';
    end if;
    if target_status = 'suspended' and length(btrim(target_reason)) = 0 then
      raise exception 'Enter a reason before suspending this business'
        using errcode = '22023';
    end if;

    select * into business_row
    from public.smartsell_businesses b
    where b.id = target_business_id
    for update;
    if not found then
      raise exception 'Business not found' using errcode = 'P0002';
    end if;

    if business_row.account_status = target_status
      and (target_status = 'active'
        or business_row.suspension_reason = btrim(target_reason)) then
      return jsonb_build_object(
        'ok', true,
        'account_status', business_row.account_status,
        'unchanged', true
      );
    end if;

    update public.smartsell_businesses
    set account_status = target_status,
        suspension_reason = case
          when target_status = 'suspended' then btrim(target_reason)
          else ''
        end,
        suspended_at = case
          when target_status = 'suspended' then now()
          else null
        end,
        suspended_by = case
          when target_status = 'suspended' then admin_id
          else null
        end
    where id = target_business_id;

    insert into public.smartsell_events (
      business_id, actor_id, category, entity, description, reference
    ) values (
      target_business_id,
      admin_id,
      'Platform Admin',
      business_row.name,
      case
        when target_status = 'suspended'
          then 'Business account suspended: ' || btrim(target_reason)
        else 'Business account reactivated by platform administrator'
      end,
      target_business_id::text
    );

    return jsonb_build_object(
      'ok', true,
      'account_status', target_status,
      'unchanged', false
    );
  end if;

  select jsonb_build_object(
    'businesses', coalesce(jsonb_agg(to_jsonb(rows) order by rows.name), '[]'::jsonb),
    'total', count(*)
  ) into result
  from (
    select b.id, b.name, b.category, b.custom_category, b.country, b.currency,
      b.created_at, b.account_status, b.suspension_reason, b.suspended_at,
      b.suspended_by, owner.name as owner_name,
      count(distinct m.id) as member_count,
      count(distinct m.id) filter (where m.active = 1) as active_member_count,
      count(distinct br.id) filter (where br.active = 1) as branch_count
    from public.smartsell_businesses b
    left join public.smartsell_members m on m.business_id = b.id
    left join public.smartsell_branches br on br.business_id = b.id
    left join lateral (
      select member.name
      from public.smartsell_members member
      where member.business_id = b.id and member.role = 'owner'
      order by member.created_at
      limit 1
    ) owner on true
    where requested_search is null
      or b.name ilike '%' || requested_search || '%'
      or coalesce(owner.name, '') ilike '%' || requested_search || '%'
      or b.country ilike '%' || requested_search || '%'
    group by b.id, owner.name
    order by b.name
    limit 500
  ) rows;

  return result;
end
$$;

revoke all on function private.smartsell_platform_business(jsonb)
  from public, anon, authenticated;

create or replace function public.smartsell_platform_business(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.smartsell_platform_business(command);
$$;

revoke all on function public.smartsell_platform_business(jsonb)
  from public, anon;
grant execute on function private.smartsell_platform_business(jsonb)
  to authenticated;
grant execute on function public.smartsell_platform_business(jsonb)
  to authenticated;