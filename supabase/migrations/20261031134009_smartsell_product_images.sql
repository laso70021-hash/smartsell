do $$
begin
  if to_regclass('public.smartsell_products') is null
    or to_regclass('public.smartsell_members') is null
    or to_regprocedure('private.ss_member()') is null
    or to_regprocedure('private.ss_assert(boolean,text)') is null then
    raise exception 'Deploy the Smartsell core schema before applying the product-image migration';
  end if;
end
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'smartsell-product-images',
  'smartsell-product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.smartsell_product_images (
  product_id uuid primary key,
  business_id uuid not null references public.smartsell_businesses(id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  foreign key (product_id, business_id)
    references public.smartsell_products(id, business_id)
    on delete cascade
);

alter table public.smartsell_product_images enable row level security;
revoke all on public.smartsell_product_images from anon, authenticated;

create or replace function private.smartsell_can_manage_product_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.smartsell_members m
    join public.smartsell_products p on p.business_id = m.business_id
    where m.id = (select auth.uid())
      and m.active = 1
      and m.role in ('owner', 'manager')
      and cardinality(storage.foldername(object_name)) = 2
      and m.business_id::text = (storage.foldername(object_name))[1]
      and p.id::text = (storage.foldername(object_name))[2]
      and storage.filename(object_name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );
$$;

revoke all on function private.smartsell_can_manage_product_image(text)
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.smartsell_can_manage_product_image(text)
  to authenticated;

drop policy if exists "Smartsell product image uploads"
  on storage.objects;
create policy "Smartsell product image uploads"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'smartsell-product-images'
    and private.smartsell_can_manage_product_image(name)
  );

drop policy if exists "Smartsell product image reads"
  on storage.objects;
create policy "Smartsell product image reads"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'smartsell-product-images'
    and private.smartsell_can_manage_product_image(name)
  );

drop policy if exists "Smartsell product image updates"
  on storage.objects;
create policy "Smartsell product image updates"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'smartsell-product-images'
    and private.smartsell_can_manage_product_image(name)
  )
  with check (
    bucket_id = 'smartsell-product-images'
    and private.smartsell_can_manage_product_image(name)
  );

drop policy if exists "Smartsell product image deletes"
  on storage.objects;
create policy "Smartsell product image deletes"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'smartsell-product-images'
    and private.smartsell_can_manage_product_image(name)
  );

create or replace function private.smartsell_product_images(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  m public.smartsell_members := private.ss_member();
  action text := command->>'action';
  image jsonb;
  product_id uuid;
  image_path text;
begin
  if action = 'list' then
    return jsonb_build_object(
      'images',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('product_id', i.product_id, 'path', i.storage_path)
            order by i.created_at
          )
          from public.smartsell_product_images i
          where i.business_id = m.business_id
        ),
        '[]'::jsonb
      )
    );
  end if;

  perform private.ss_assert(m.role in ('owner', 'manager'), 'Manager permission required');
  perform private.ss_assert(
    action = 'save'
      and case
        when jsonb_typeof(command->'images') = 'array'
          then jsonb_array_length(command->'images') between 1 and 500
        else false
      end,
    'Provide 1 to 500 product image records'
  );

  for image in select value from jsonb_array_elements(command->'images')
  loop
    product_id := nullif(image->>'product_id', '')::uuid;
    image_path := nullif(trim(coalesce(image->>'path', '')), '');

    perform private.ss_assert(
      exists (
        select 1
        from public.smartsell_products p
        where p.id = product_id and p.business_id = m.business_id
      ),
      'Product not found in this business'
    );

    if image_path is null then
      delete from public.smartsell_product_images
      where smartsell_product_images.product_id = product_id
        and business_id = m.business_id;
    else
      perform private.ss_assert(
        octet_length(image_path) <= 500
          and cardinality(storage.foldername(image_path)) = 2
          and (storage.foldername(image_path))[1] = m.business_id::text
          and (storage.foldername(image_path))[2] = product_id::text
          and storage.filename(image_path) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        'Invalid product image path'
      );

      insert into public.smartsell_product_images(product_id, business_id, storage_path)
      values (product_id, m.business_id, image_path)
      on conflict (product_id) do update
      set storage_path = excluded.storage_path,
          created_at = now();
    end if;
  end loop;

  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.smartsell_product_images(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.smartsell_product_images(command);
$$;

revoke all on function private.smartsell_product_images(jsonb)
  from public, anon, authenticated;
revoke all on function public.smartsell_product_images(jsonb)
  from public, anon, authenticated;
grant execute on function private.smartsell_product_images(jsonb)
  to authenticated;
grant execute on function public.smartsell_product_images(jsonb)
  to authenticated;