-- Persist each tenant's category so category-specific navigation and workflows remain available.
alter table public.smartsell_businesses
  add column if not exists category text not null default 'Retail',
  add column if not exists custom_category text not null default '';

update public.smartsell_businesses business
   set category = case
         when owner.raw_user_meta_data->>'category' in (
           'Retail', 'Grocery', 'Fashion', 'Electronics', 'Restaurant',
           'Pharmacy', 'Beauty & Personal Care', 'Hardware', 'Other'
         ) then owner.raw_user_meta_data->>'category'
         else 'Retail'
       end,
       custom_category = coalesce(owner.raw_user_meta_data->>'custom_category', '')
  from public.smartsell_members member
  join auth.users owner on owner.id = member.id
 where member.business_id = business.id
   and member.role = 'owner';

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

  select u.email into email from auth.users u where u.id = auth.uid();
  insert into public.smartsell_businesses
    (id, name, currency, country, timezone, category, custom_category)
  values (
    biz,
    private.ss_text(v, 'business'),
    coalesce(v->>'currency', 'TZS'),
    private.ss_text(v, 'country'),
    v->>'timezone',
    category,
    custom_category
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
  business_category text := coalesce(command->>'category', 'Retail');
  business_custom_category text := coalesce(command->>'custom_category', '');
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
  perform private.ss_assert(
    business_category in (
      'Retail', 'Grocery', 'Fashion', 'Electronics', 'Restaurant',
      'Pharmacy', 'Beauty & Personal Care', 'Hardware', 'Other'
    ),
    'Invalid business category'
  );
  perform private.ss_assert(
    business_category <> 'Other' or length(business_custom_category) > 0,
    'Enter your business category'
  );

  update public.smartsell_businesses
     set name = private.ss_text(command, 'name'),
         currency = command->>'currency',
         country = private.ss_text(command, 'country'),
         timezone = command->>'timezone',
         email = private.ss_text(command, 'email', false),
         phone = private.ss_text(command, 'phone', false),
         address = private.ss_text(command, 'address', false),
         tax_id = private.ss_text(command, 'tax_id', false),
         category = business_category,
         custom_category = business_custom_category
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
