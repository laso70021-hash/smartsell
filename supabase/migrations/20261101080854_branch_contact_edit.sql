drop trigger if exists smartsell on public.smartsell_branches;

create or replace function private.smartsell_update_branch(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.smartsell_members := private.ss_member();
  path text := command->>'path';
  method text := command->>'method';
  v jsonb := command->'body';
  op_id uuid := (command->>'id')::uuid;
  entity_id uuid := (command->>'entity_id')::uuid;
  target uuid;
  date_at timestamptz := (command->>'created_at')::timestamptz;
  prior public.smartsell_operations;
  branch public.smartsell_branches;
  result jsonb;
begin
  perform private.ss_assert(
    op_id is not null and entity_id is not null and method = 'PUT'
      and path ~ '^/branches/[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$',
    'Invalid branch operation'
  );
  perform private.ss_assert(
    m.role in ('owner', 'manager'),
    'Your role does not permit this action'
  );
  perform pg_advisory_xact_lock(hashtextextended(m.business_id::text, 0));

  select * into prior
    from public.smartsell_operations
   where id = op_id;
  if found then
    perform private.ss_assert(
      prior.business_id = m.business_id
        and prior.actor_id = m.id
        and prior.payload = command,
      'Operation key reused with a different request'
    );
    return prior.response;
  end if;

  perform private.ss_assert(
    date_at between now() - interval '7 days' and now() + interval '5 minutes',
    'Device operation is too old or its clock is incorrect'
  );
  target := split_part(path, '/', 3)::uuid;
  perform private.ss_assert(entity_id = target, 'Invalid branch operation');
  select * into branch
    from public.smartsell_branches
   where id = target and business_id = m.business_id and active = 1
   for update;
  perform private.ss_assert(found, 'Branch not found');

  update public.smartsell_branches
     set name = private.ss_text(v, 'name'),
         phone = private.ss_text(v, 'phone', false),
         address = private.ss_text(v, 'address', false)
   where id = target and business_id = m.business_id and active = 1
  returning * into branch;

  result := jsonb_build_object('id', target, 'ok', true);
  perform private.ss_event(
    m,
    target,
    'Business',
    branch.name,
    'Branch details updated',
    target::text
  );
  insert into public.smartsell_operations(id, business_id, actor_id, payload, response)
  values (op_id, m.business_id, m.id, command, result);
  return result;
end
$$;

revoke all on function private.smartsell_update_branch(jsonb) from public, anon, authenticated;
grant execute on function private.smartsell_update_branch(jsonb) to authenticated;

create or replace function public.smartsell_command(command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if command->>'path' like '/branches/%'
     and command->>'method' = 'PUT' then
    return private.smartsell_update_branch(command);
  end if;
  return private.smartsell_command(command);
end
$$;