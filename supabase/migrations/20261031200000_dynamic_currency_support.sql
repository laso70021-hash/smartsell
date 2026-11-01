-- The browser builds its list from Intl's ISO currency data; the database accepts ISO-shaped codes.
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
begin
  identity := private.smartsell_identity();
  if identity is not null then return identity; end if;

  perform private.ss_assert(
    exists (select 1 from pg_timezone_names where name = v->>'timezone'),
    'Invalid timezone'
  );
  perform private.ss_assert(
    coalesce(v->>'currency', 'TZS') ~ '^[A-Z]{3}$',
    'Currency must be a three-letter ISO code'
  );

  select u.email into email from auth.users u where u.id = auth.uid();
  insert into public.smartsell_businesses(id, name, currency, country, timezone)
  values (
    biz,
    private.ss_text(v, 'business'),
    coalesce(v->>'currency', 'TZS'),
    private.ss_text(v, 'country'),
    v->>'timezone'
  );
  insert into public.smartsell_branches(id, business_id, name)
  values (br, biz, private.ss_text(v, 'branch'));
  insert into public.smartsell_members(id, business_id, branch_id, name, email, role)
  values (auth.uid(), biz, br, private.ss_text(v, 'name'), email, 'owner');
  return private.smartsell_identity();
end
$$;

create or replace function private.smartsell_update_business(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.smartsell_members := private.ss_member();
  saved public.smartsell_businesses;
begin
  perform private.ss_assert(m.role = 'owner', 'Owner permission required');
  perform private.ss_assert(
    exists (select 1 from pg_timezone_names where name = command->>'timezone'),
    'Invalid timezone'
  );
  perform private.ss_assert(
    command->>'currency' ~ '^[A-Z]{3}$',
    'Currency must be a three-letter ISO code'
  );

  update public.smartsell_businesses
     set name = private.ss_text(command, 'name'),
         currency = command->>'currency',
         country = private.ss_text(command, 'country'),
         timezone = command->>'timezone',
         email = private.ss_text(command, 'email', false),
         phone = private.ss_text(command, 'phone', false),
         address = private.ss_text(command, 'address', false),
         tax_id = private.ss_text(command, 'tax_id', false)
   where id = m.business_id
  returning * into saved;

  perform private.ss_event(
    m,
    null,
    'Business',
    saved.name,
    'Business profile updated',
    saved.id::text
  );
  return to_jsonb(saved);
end
$$;
