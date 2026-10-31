create function private.smartsell_team_invite(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.smartsell_members := private.ss_member();
  team_name text := trim(coalesce(command->>'name', ''));
  team_email text := lower(trim(coalesce(command->>'email', '')));
  team_role text := command->>'role';
  team_branch uuid := nullif(command->>'branch_id', '')::uuid;
  invitation public.smartsell_invitations;
begin
  perform private.ss_assert(m.role = 'owner', 'Owner permission required');
  perform private.ss_assert(length(team_name) between 1 and 120, 'Enter a valid team member name');
  perform private.ss_assert(team_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$', 'Enter a valid email address');
  perform private.ss_assert(team_role in ('manager', 'cashier'), 'Invalid team role');
  perform private.ss_assert(
    exists (
      select 1
      from public.smartsell_branches b
      where b.id = team_branch and b.business_id = m.business_id and b.active = 1
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
      invitation.business_id = m.business_id,
      'This email already has a pending invitation for another business'
    );
    update public.smartsell_invitations
    set branch_id = team_branch,
        name = team_name,
        role = team_role,
        created_at = now()
    where id = invitation.id
    returning * into invitation;
  else
    insert into public.smartsell_invitations
      (id, business_id, branch_id, name, email, role)
    values
      (gen_random_uuid(), m.business_id, team_branch, team_name, team_email, team_role)
    returning * into invitation;
  end if;

  return jsonb_build_object(
    'id', invitation.id,
    'name', invitation.name,
    'email', invitation.email,
    'role', invitation.role,
    'branch_id', invitation.branch_id,
    'invited', true
  );
end
$$;

create function public.smartsell_team_invite(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.smartsell_team_invite(command);
$$;

revoke all on function private.smartsell_team_invite(jsonb) from public, anon, authenticated;
revoke all on function public.smartsell_team_invite(jsonb) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.smartsell_team_invite(jsonb) to authenticated;
grant execute on function public.smartsell_team_invite(jsonb) to authenticated;
