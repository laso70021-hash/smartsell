alter table public.smartsell_stock
  alter column quantity type numeric(12,3) using quantity::numeric(12,3);
alter table public.smartsell_movements
  alter column delta type numeric(12,3) using delta::numeric(12,3);

create or replace function private.ss_movement(
  biz uuid,
  b uuid,
  p uuid,
  d numeric,
  reason text,
  ref text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  current_quantity numeric(12,3);
begin
  perform private.ss_assert(d = round(d, 3), 'Use up to three decimal places.');
  insert into public.smartsell_stock(business_id, product_id, branch_id, quantity)
  values (biz, p, b, 0)
  on conflict do nothing;

  select s.quantity
    into current_quantity
    from public.smartsell_stock s
   where s.product_id = p and s.branch_id = b
   for update;
  perform private.ss_assert(
    current_quantity + d between 0 and 100000000,
    'Insufficient stock or quantity exceeds limit'
  );

  update public.smartsell_stock
     set quantity = current_quantity + d
   where product_id = p and branch_id = b;
  insert into public.smartsell_movements(
    business_id, branch_id, product_id, delta, reason, reference
  )
  values (biz, b, p, d, reason, ref);
end
$$;

create or replace function private.ss_movement(
  biz uuid,
  b uuid,
  p uuid,
  d integer,
  reason text,
  ref text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.ss_movement(biz, b, p, d::numeric, reason, ref);
end
$$;

create table if not exists public.smartsell_dining_tables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.smartsell_businesses(id),
  branch_id uuid not null,
  name text not null,
  seats integer not null default 2 check (seats between 1 and 100),
  active integer not null default 1 check (active in (0, 1)),
  unique (branch_id, name),
  unique (id, business_id, branch_id),
  foreign key (branch_id, business_id)
    references public.smartsell_branches(id, business_id)
);

create table if not exists public.smartsell_kitchen_stations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.smartsell_businesses(id),
  branch_id uuid not null,
  name text not null,
  active integer not null default 1 check (active in (0, 1)),
  unique (branch_id, name),
  unique (id, business_id, branch_id),
  foreign key (branch_id, business_id)
    references public.smartsell_branches(id, business_id)
);

create table if not exists public.smartsell_restaurant_orders (
  id uuid primary key,
  business_id uuid not null references public.smartsell_businesses(id),
  branch_id uuid not null,
  table_id uuid not null,
  reference text not null unique,
  status text not null check (
    status in ('open', 'submitted', 'preparing', 'ready', 'served', 'closed', 'cancelled')
  ),
  notes text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (id, business_id, branch_id),
  foreign key (branch_id, business_id)
    references public.smartsell_branches(id, business_id),
  foreign key (table_id, business_id, branch_id)
    references public.smartsell_dining_tables(id, business_id, branch_id)
);

create table if not exists public.smartsell_restaurant_order_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.smartsell_businesses(id),
  branch_id uuid not null,
  order_id uuid not null,
  product_id uuid not null,
  station_id uuid,
  name text not null,
  sku text not null,
  quantity numeric(12,3) not null check (quantity between 0.001 and 100000),
  price bigint not null check (price >= 0),
  cost bigint not null check (cost >= 0),
  status text not null default 'queued'
    check (status in ('queued', 'preparing', 'ready', 'served', 'cancelled')),
  foreign key (order_id, business_id, branch_id)
    references public.smartsell_restaurant_orders(id, business_id, branch_id)
    on delete cascade,
  foreign key (product_id, business_id)
    references public.smartsell_products(id, business_id),
  foreign key (station_id, business_id, branch_id)
    references public.smartsell_kitchen_stations(id, business_id, branch_id)
);

create index if not exists smartsell_dining_tables_branch_idx
  on public.smartsell_dining_tables(branch_id, business_id);
create index if not exists smartsell_kitchen_stations_branch_idx
  on public.smartsell_kitchen_stations(branch_id, business_id);
create index if not exists smartsell_restaurant_orders_scope_idx
  on public.smartsell_restaurant_orders(business_id, branch_id, created_at desc);
create index if not exists smartsell_restaurant_orders_table_idx
  on public.smartsell_restaurant_orders(table_id, business_id, branch_id);
create unique index if not exists smartsell_restaurant_one_active_order_per_table_idx
  on public.smartsell_restaurant_orders(table_id)
  where status in ('open', 'submitted', 'preparing', 'ready', 'served');
create index if not exists smartsell_restaurant_items_order_idx
  on public.smartsell_restaurant_order_items(order_id, status);
create index if not exists smartsell_restaurant_items_product_idx
  on public.smartsell_restaurant_order_items(product_id, business_id);
create index if not exists smartsell_restaurant_items_station_idx
  on public.smartsell_restaurant_order_items(station_id, business_id, branch_id)
  where station_id is not null;

alter table public.smartsell_dining_tables enable row level security;
alter table public.smartsell_kitchen_stations enable row level security;
alter table public.smartsell_restaurant_orders enable row level security;
alter table public.smartsell_restaurant_order_items enable row level security;
revoke all on public.smartsell_dining_tables,
  public.smartsell_kitchen_stations,
  public.smartsell_restaurant_orders,
  public.smartsell_restaurant_order_items
  from public, anon, authenticated;

create function private.smartsell_restaurant(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  m public.smartsell_members := private.ss_member();
  action text := command->>'action';
  v jsonb := coalesce(command->'body', '{}'::jsonb);
  branch_id uuid;
  operation_id uuid := nullif(command->>'id', '')::uuid;
  entity_id uuid := nullif(command->>'entity_id', '')::uuid;
  created_at timestamptz := nullif(command->>'created_at', '')::timestamptz;
  prior public.smartsell_operations;
  dining_table public.smartsell_dining_tables;
  station public.smartsell_kitchen_stations;
  restaurant_order public.smartsell_restaurant_orders;
  order_item public.smartsell_restaurant_order_items;
  product public.smartsell_products;
  line jsonb;
  table_id uuid;
  item_id uuid;
  product_id uuid;
  station_id uuid;
  item_quantity numeric(12,3);
  table_name text;
  reference text;
  tables_data jsonb;
  stations_data jsonb;
  orders_data jsonb;
  result jsonb;
  next_status text;
  all_ready boolean;
  all_served boolean;
begin
  perform private.ss_assert(
    m.role in ('owner', 'manager'),
    'Your role does not permit this action'
  );
  perform private.ss_assert(
    exists (
      select 1
        from public.smartsell_businesses b
       where b.id = m.business_id and b.category = 'Restaurant'
    ),
    'Restaurant tools are only available to Restaurant businesses'
  );

  if action = 'list' then
    branch_id := coalesce(nullif(command->>'branch_id', '')::uuid, m.branch_id);
    perform private.ss_branch(m, branch_id);

    select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]'::jsonb)
      into tables_data
      from public.smartsell_dining_tables t
     where t.business_id = m.business_id
       and t.branch_id = branch_id
       and t.active = 1;
    select coalesce(jsonb_agg(to_jsonb(s) order by s.name), '[]'::jsonb)
      into stations_data
      from public.smartsell_kitchen_stations s
     where s.business_id = m.business_id
       and s.branch_id = branch_id
       and s.active = 1;
    select coalesce(jsonb_agg(q.data order by q.created_at desc), '[]'::jsonb)
      into orders_data
      from (
        select o.created_at,
               to_jsonb(o) || jsonb_build_object(
                 'table_name', t.name,
                 'actor', u.name,
                 'items', coalesce((
                   select jsonb_agg(
                     to_jsonb(i) || jsonb_build_object('station_name', s.name)
                     order by s.name, i.name
                   )
                     from public.smartsell_restaurant_order_items i
                     left join public.smartsell_kitchen_stations s
                       on s.id = i.station_id
                      and s.business_id = i.business_id
                      and s.branch_id = i.branch_id
                    where i.order_id = o.id
                 ), '[]'::jsonb)
               ) as data
          from public.smartsell_restaurant_orders o
          join public.smartsell_dining_tables t
            on t.id = o.table_id
           and t.business_id = o.business_id
           and t.branch_id = o.branch_id
          join public.smartsell_members u on u.id = o.created_by
         where o.business_id = m.business_id
           and o.branch_id = branch_id
         order by o.created_at desc
         limit 200
      ) q;
    return jsonb_build_object(
      'tables', tables_data,
      'stations', stations_data,
      'orders', orders_data
    );
  end if;

  perform private.ss_assert(
    action in (
      'create_table', 'create_station', 'create_order', 'submit_order',
      'set_item_status', 'close_order', 'cancel_order'
    ),
    'Unsupported restaurant operation'
  );
  perform private.ss_assert(
    operation_id is not null and entity_id is not null,
    'Invalid restaurant operation'
  );
  perform pg_advisory_xact_lock(hashtextextended(operation_id::text, 1));
  select * into prior
    from public.smartsell_operations o
   where o.id = operation_id;
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
    created_at between now() - interval '7 days' and now() + interval '5 minutes',
    'Device operation is too old or its clock is incorrect'
  );

  if action in ('create_table', 'create_station', 'create_order') then
    branch_id := coalesce(nullif(v->>'branch_id', '')::uuid, m.branch_id);
    perform private.ss_branch(m, branch_id);
  end if;

  if action = 'create_table' then
    table_name := private.ss_text(v, 'name');
    perform private.ss_assert(entity_id is not null, 'Invalid table');
    insert into public.smartsell_dining_tables(
      id, business_id, branch_id, name, seats
    )
    values (
      entity_id, m.business_id, branch_id, table_name,
      private.ss_int(v, 'seats', 1, 100)
    );
    result := jsonb_build_object('id', entity_id);
    perform private.ss_event(
      m, branch_id, 'Restaurant', table_name, 'Dining table created', entity_id::text
    );
  elsif action = 'create_station' then
    table_name := private.ss_text(v, 'name');
    insert into public.smartsell_kitchen_stations(
      id, business_id, branch_id, name
    )
    values (entity_id, m.business_id, branch_id, table_name);
    result := jsonb_build_object('id', entity_id);
    perform private.ss_event(
      m, branch_id, 'Restaurant', table_name, 'Kitchen station created', entity_id::text
    );
  elsif action = 'create_order' then
    table_id := nullif(v->>'table_id', '')::uuid;
    perform private.ss_assert(table_id is not null, 'Dining table not found');
    select * into dining_table
      from public.smartsell_dining_tables t
     where t.id = table_id
       and t.business_id = m.business_id
       and t.branch_id = branch_id
       and t.active = 1
     for update;
    perform private.ss_assert(found, 'Dining table not found');
    perform private.ss_assert(
      not exists (
        select 1
          from public.smartsell_restaurant_orders o
         where o.table_id = dining_table.id
           and o.status in ('open', 'submitted', 'preparing', 'ready', 'served')
      ),
      'This table already has an active order'
    );
    if jsonb_typeof(v->'items') <> 'array' then
      raise exception 'Add at least one product to the table order';
    end if;
    perform private.ss_assert(
      jsonb_array_length(v->'items') between 1 and 100,
      'Add between 1 and 100 products to the table order'
    );
    reference := 'RO-' || upper(substr(entity_id::text, 1, 8));
    insert into public.smartsell_restaurant_orders(
      id, business_id, branch_id, table_id, reference, status, notes,
      created_by, created_at, updated_at
    )
    values (
      entity_id, m.business_id, branch_id, table_id, reference, 'open',
      private.ss_text(v, 'notes', false), m.id, created_at, created_at
    );
    for line in select value from jsonb_array_elements(v->'items') loop
      perform private.ss_assert(
        nullif(line->>'variant_id', '') is null,
        'Product variants are not supported for this menu item'
      );
      product_id := nullif(line->>'product_id', '')::uuid;
      select * into product
        from public.smartsell_products p
       where p.id = product_id
         and p.business_id = m.business_id
         and p.active = 1;
      perform private.ss_assert(found, 'Product not found');
      perform private.ss_assert(
        coalesce(line->>'quantity', '') ~ '^[0-9]+([.][0-9]{1,3})?$',
        'Invalid restaurant quantity'
      );
      item_quantity := (line->>'quantity')::numeric;
      perform private.ss_assert(
        item_quantity between 0.001 and 100000,
        'Restaurant quantity is outside the supported range'
      );
      station_id := nullif(line->>'station_id', '')::uuid;
      if station_id is not null then
        select * into station
          from public.smartsell_kitchen_stations s
         where s.id = station_id
           and s.business_id = m.business_id
           and s.branch_id = branch_id
           and s.active = 1;
        perform private.ss_assert(found, 'Kitchen station not found');
      end if;
      insert into public.smartsell_restaurant_order_items(
        business_id, branch_id, order_id, product_id, station_id,
        name, sku, quantity, price, cost
      )
      values (
        m.business_id, branch_id, entity_id, product_id, station_id,
        product.name, product.sku, item_quantity, product.price, product.cost
      );
    end loop;
    result := jsonb_build_object('id', entity_id, 'reference', reference);
    perform private.ss_event(
      m, branch_id, 'Restaurant', dining_table.name,
      'Table order opened', reference
    );
  else
    select * into restaurant_order
      from public.smartsell_restaurant_orders o
     where o.id = entity_id and o.business_id = m.business_id
     for update;
    perform private.ss_assert(found, 'Restaurant order not found');
    branch_id := restaurant_order.branch_id;
    perform private.ss_branch(m, branch_id);

    if action = 'submit_order' then
      perform private.ss_assert(
        restaurant_order.status = 'open',
        'This order is no longer open'
      );
      for order_item in
        select i.*
          from public.smartsell_restaurant_order_items i
         where i.order_id = restaurant_order.id
         order by i.id
      loop
        perform private.ss_movement(
          m.business_id, branch_id, order_item.product_id,
          -order_item.quantity, 'Restaurant order', restaurant_order.reference
        );
      end loop;
      update public.smartsell_restaurant_orders
         set status = 'submitted', updated_at = now()
       where id = restaurant_order.id;
      result := jsonb_build_object('ok', true);
      perform private.ss_event(
        m, branch_id, 'Restaurant', restaurant_order.reference,
        'Order sent to kitchen; stock deducted', restaurant_order.reference
      );
    elsif action = 'set_item_status' then
      perform private.ss_assert(
        restaurant_order.status in ('submitted', 'preparing', 'ready'),
        'Send the order to the kitchen before updating its items'
      );
      item_id := nullif(command->>'item_id', '')::uuid;
      select * into order_item
        from public.smartsell_restaurant_order_items i
       where i.id = item_id and i.order_id = restaurant_order.id
       for update;
      perform private.ss_assert(found, 'Order item not found');
      next_status := case order_item.status
        when 'queued' then 'preparing'
        when 'preparing' then 'ready'
        when 'ready' then 'served'
        else null
      end;
      perform private.ss_assert(
        next_status is not null and next_status = command->>'status',
        'Order item status must advance one step at a time'
      );
      update public.smartsell_restaurant_order_items
         set status = next_status
       where id = order_item.id;
      select bool_and(i.status in ('ready', 'served')),
             bool_and(i.status = 'served')
        into all_ready, all_served
        from public.smartsell_restaurant_order_items i
       where i.order_id = restaurant_order.id;
      update public.smartsell_restaurant_orders
         set status = case
           when all_served then 'served'
           when all_ready then 'ready'
           else 'preparing'
         end,
             updated_at = now()
       where id = restaurant_order.id;
      result := jsonb_build_object('ok', true);
      perform private.ss_event(
        m, branch_id, 'Restaurant', order_item.name,
        'Kitchen item marked ' || next_status, restaurant_order.reference
      );
    elsif action = 'close_order' then
      perform private.ss_assert(
        restaurant_order.status = 'served',
        'All order items must be served before closing'
      );
      update public.smartsell_restaurant_orders
         set status = 'closed', updated_at = now()
       where id = restaurant_order.id;
      result := jsonb_build_object('ok', true);
      perform private.ss_event(
        m, branch_id, 'Restaurant', restaurant_order.reference,
        'Table order closed; payment is recorded separately in POS',
        restaurant_order.reference
      );
    else
      perform private.ss_assert(
        action = 'cancel_order' and restaurant_order.status = 'open',
        'Only an unsent order can be cancelled'
      );
      update public.smartsell_restaurant_order_items
         set status = 'cancelled'
       where order_id = restaurant_order.id;
      update public.smartsell_restaurant_orders
         set status = 'cancelled', updated_at = now()
       where id = restaurant_order.id;
      result := jsonb_build_object('ok', true);
      perform private.ss_event(
        m, branch_id, 'Restaurant', restaurant_order.reference,
        'Unsent table order cancelled', restaurant_order.reference
      );
    end if;
  end if;

  insert into public.smartsell_operations(id, business_id, actor_id, payload, response)
  values (operation_id, m.business_id, m.id, command, result);
  return result;
end
$$;

create function public.smartsell_restaurant(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.smartsell_restaurant(command);
$$;

revoke all on function private.ss_movement(uuid, uuid, uuid, numeric, text, text)
  from public, anon, authenticated;
revoke all on function private.ss_movement(uuid, uuid, uuid, integer, text, text)
  from public, anon, authenticated;
revoke all on function private.smartsell_restaurant(jsonb)
  from public, anon, authenticated;
revoke all on function public.smartsell_restaurant(jsonb)
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.smartsell_restaurant(jsonb) to authenticated;
grant execute on function public.smartsell_restaurant(jsonb) to authenticated;