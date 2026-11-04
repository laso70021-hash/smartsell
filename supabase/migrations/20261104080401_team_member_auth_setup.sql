alter table public.smartsell_members
  add column account_status text not null default 'active',
  add column expires_at date,
  add column must_change_password boolean not null default false;

update public.smartsell_members
   set account_status = case when active = 1 then 'active' else 'suspended' end;

alter table public.smartsell_members
  add constraint smartsell_members_account_status_check
  check (account_status in ('active', 'pending', 'suspended'));

alter table public.smartsell_invitations
  add column account_status text not null default 'active',
  add column expires_at date,
  add column must_change_password boolean not null default false;

alter table public.smartsell_invitations
  add constraint smartsell_invitations_account_status_check
  check (account_status in ('active', 'pending', 'suspended'));

create or replace function private.ss_member()
returns public.smartsell_members
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  member_row public.smartsell_members;
begin
  perform private.ss_assert(auth.uid() is not null, 'Sign in to continue');

  select * into member_row
  from public.smartsell_members
  where id = auth.uid() and active = 1 and account_status = 'active';
  perform private.ss_assert(
    found,
    'No active Smartsell membership. Sign in and finish business setup.'
  );
  perform private.ss_assert(
    not member_row.must_change_password,
    'Change your temporary password before accessing the workspace.'
  );
  perform private.ss_assert(
    member_row.expires_at is null
    or member_row.expires_at >= (
      select (now() at time zone business.timezone)::date
      from public.smartsell_businesses business
      where business.id = member_row.business_id
    ),
    'Your team access has expired. Contact your business owner.'
  );
  perform private.ss_assert(
    exists (
      select 1
      from public.smartsell_businesses business
      where business.id = member_row.business_id
        and business.account_status = 'active'
    ),
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
  access_expired boolean;
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
        id, business_id, branch_id, name, email, role, active,
        account_status, expires_at, must_change_password
      ) values (
        auth.uid(), invitation.business_id, invitation.branch_id,
        invitation.name, invitation.email, invitation.role,
        case when invitation.account_status = 'active' then 1 else 0 end,
        invitation.account_status, invitation.expires_at,
        invitation.must_change_password
      ) returning * into member_row;
      delete from public.smartsell_invitations where id = invitation.id;
    end if;
  end if;

  if member_row.id is null then
    return null;
  end if;

  select business.account_status, business.suspension_reason
    into business_status, business_reason
  from public.smartsell_businesses business
  where business.id = member_row.business_id;

  select coalesce(
    member_row.expires_at < (now() at time zone business.timezone)::date,
    false
  ) into access_expired
  from public.smartsell_businesses business
  where business.id = member_row.business_id;

  select exists (
    select 1
    from private.smartsell_platform_admins admin
    where admin.user_id = auth.uid() and admin.active
  ) into platform_admin;

  return to_jsonb(member_row) || jsonb_build_object(
    'account_status', business_status,
    'suspension_reason', business_reason,
    'member_status', member_row.account_status,
    'access_expired', access_expired,
    'is_admin', platform_admin
  );
end
$$;

create or replace function private.smartsell_team_invite(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_row public.smartsell_members := private.ss_member();
  team_name text := trim(coalesce(command->>'name', ''));
  team_email text := lower(trim(coalesce(command->>'email', '')));
  team_role text := command->>'role';
  team_branch uuid := nullif(command->>'branch_id', '')::uuid;
  team_status text := coalesce(command->>'account_status', 'active');
  team_expires date := nullif(command->>'expires_at', '')::date;
  require_password_change boolean := command->>'setup_method' = 'manual';
  invitation public.smartsell_invitations;
begin
  perform private.ss_assert(member_row.role = 'owner', 'Owner permission required');
  perform private.ss_assert(length(team_name) between 1 and 120, 'Enter a valid team member name');
  perform private.ss_assert(team_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$', 'Enter a valid email address');
  perform private.ss_assert(team_role in ('manager', 'cashier'), 'Invalid team role');
  perform private.ss_assert(team_status in ('active', 'pending', 'suspended'), 'Invalid access status');
  perform private.ss_assert(team_expires is null or team_expires >= current_date, 'Access expiry must be today or later');
  perform private.ss_assert(
    exists (
      select 1
      from public.smartsell_branches branch
      where branch.id = team_branch
        and branch.business_id = member_row.business_id
        and branch.active = 1
    ),
    'Choose an active branch in this business'
  );
  perform private.ss_assert(
    not exists (
      select 1 from public.smartsell_members member
      where lower(member.email) = team_email
    ),
    'This email already belongs to a Smartsell team'
  );
  perform pg_advisory_xact_lock(hashtextextended(team_email, 0));

  select * into invitation
  from public.smartsell_invitations i
  where lower(i.email) = team_email
  for update;

  if found then
    perform private.ss_assert(
      invitation.business_id = member_row.business_id,
      'This email already has a pending invitation for another business'
    );
    update public.smartsell_invitations
       set branch_id = team_branch,
           name = team_name,
           role = team_role,
           account_status = team_status,
           expires_at = team_expires,
           must_change_password = require_password_change,
           created_at = now()
     where id = invitation.id
     returning * into invitation;
  else
    insert into public.smartsell_invitations (
      id, business_id, branch_id, name, email, role, account_status,
      expires_at, must_change_password
    ) values (
      gen_random_uuid(), member_row.business_id, team_branch,
      team_name, team_email, team_role, team_status,
      team_expires, require_password_change
    ) returning * into invitation;
  end if;

  return jsonb_build_object(
    'id', invitation.id,
    'name', invitation.name,
    'email', invitation.email,
    'role', invitation.role,
    'branch_id', invitation.branch_id,
    'account_status', invitation.account_status,
    'expires_at', invitation.expires_at,
    'must_change_password', invitation.must_change_password,
    'invited', true
  );
end
$$;

create or replace function public.smartsell_team_invite(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.smartsell_team_invite(command);
$$;

create or replace function private.smartsell_team_manage(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_row public.smartsell_members := private.ss_member();
  target public.smartsell_members;
  target_id uuid := nullif(command->>'member_id', '')::uuid;
  requested_action text := command->>'action';
  requested_status text;
  requested_branch uuid;
begin
  perform private.ss_assert(member_row.role = 'owner', 'Owner permission required');

  select * into target
  from public.smartsell_members
  where id = target_id
    and business_id = member_row.business_id
    and role <> 'owner'
  for update;
  perform private.ss_assert(found, 'Team member not found');

  if requested_action = 'delete' then
    perform private.ss_event(
      member_row, target.branch_id, 'Staff', target.name,
      'Team member removed', target.id::text
    );
    delete from public.smartsell_members where id = target.id;
    return jsonb_build_object('id', target.id, 'deleted', true);
  elsif requested_action = 'toggle' then
    requested_status := case
      when target.account_status = 'active' then 'suspended'
      else 'active'
    end;
    update public.smartsell_members
       set account_status = requested_status,
           active = case when requested_status = 'active' then 1 else 0 end
     where id = target.id
     returning * into target;
  elsif requested_action = 'edit' then
    requested_status := coalesce(command->>'account_status', target.account_status);
    requested_branch := coalesce(
      nullif(command->>'branch_id', '')::uuid,
      target.branch_id
    );
    perform private.ss_assert(
      requested_status in ('active', 'pending', 'suspended'),
      'Invalid access status'
    );
    perform private.ss_assert(
      nullif(command->>'expires_at', '') is null
      or (command->>'expires_at')::date >= current_date,
      'Access expiry must be today or later'
    );
    perform private.ss_assert(
      command->>'role' in ('manager', 'cashier'),
      'Invalid team role'
    );
    perform private.ss_assert(
      exists (
        select 1 from public.smartsell_branches branch
        where branch.id = requested_branch
          and branch.business_id = member_row.business_id
          and branch.active = 1
      ),
      'Choose an active branch in this business'
    );
    update public.smartsell_members
       set name = coalesce(nullif(btrim(command->>'name'), ''), name),
           role = command->>'role',
           branch_id = requested_branch,
           account_status = requested_status,
           active = case when requested_status = 'active' then 1 else 0 end,
           expires_at = nullif(command->>'expires_at', '')::date
     where id = target.id
     returning * into target;
  else
    raise exception 'Unsupported team member action';
  end if;

  perform private.ss_event(
    member_row, target.branch_id, 'Staff', target.name,
    case when requested_action = 'toggle'
      then 'Staff access changed'
      else 'Team member updated'
    end,
    target.id::text
  );
  return to_jsonb(target);
end
$$;

create or replace function public.smartsell_team_manage(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.smartsell_team_manage(command);
$$;

create or replace function public.smartsell_complete_password_setup(target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  update public.smartsell_members
     set must_change_password = false
   where id = target_user;
end
$$;

revoke all on function private.smartsell_team_invite(jsonb) from public, anon, authenticated;
revoke all on function public.smartsell_team_invite(jsonb) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.smartsell_team_invite(jsonb) to authenticated;
grant execute on function public.smartsell_team_invite(jsonb) to authenticated;

revoke all on function private.smartsell_team_manage(jsonb) from public, anon, authenticated;
revoke all on function public.smartsell_team_manage(jsonb) from public, anon, authenticated;
grant execute on function private.smartsell_team_manage(jsonb) to authenticated;
grant execute on function public.smartsell_team_manage(jsonb) to authenticated;

revoke all on function public.smartsell_complete_password_setup(uuid) from public, anon, authenticated;
grant execute on function public.smartsell_complete_password_setup(uuid) to service_role;