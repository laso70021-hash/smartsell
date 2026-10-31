do $$
begin
  if exists (
    select 1
    from public.smartsell_product_images
    group by product_id
    having count(*) > 1
  ) then
    raise exception
      'Product image registry contains duplicate product IDs; resolve duplicates before adding its unique index';
  end if;

  if not exists (
    select 1
    from pg_index i
    where i.indrelid = 'public.smartsell_product_images'::regclass
      and i.indisunique
      and i.indisvalid
      and i.indpred is null
      and i.indnkeyatts = 1
      and pg_get_indexdef(i.indexrelid, 1, true) = 'product_id'
  ) then
    execute
      'create unique index smartsell_product_images_product_id_uidx on public.smartsell_product_images (product_id)';
  end if;
end
$$;
