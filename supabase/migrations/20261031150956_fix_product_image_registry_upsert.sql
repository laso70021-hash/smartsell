-- Resolve the primary key by its constraint name. With #variable_conflict use_variable,
-- the PL/pgSQL product_id variable shadows an unqualified ON CONFLICT column target.
do $$
begin
  if to_regclass('public.smartsell_product_images') is null
    or not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.smartsell_product_images'::regclass
        and conname = 'smartsell_product_images_pkey'
        and contype in ('p', 'u')
    ) then
    raise exception 'The Smartsell product image registry must have its product_id primary key';
  end if;
end
$$;

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
      on conflict on constraint smartsell_product_images_pkey do update
      set storage_path = excluded.storage_path,
          created_at = now();
    end if;
  end loop;

  return jsonb_build_object('ok', true);
end
$$;