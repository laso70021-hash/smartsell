create table private.smartsell_platform_business_reviews (
  business_id uuid primary key references public.smartsell_businesses(id) on delete cascade,
  status text not null default 'pending' check (
    status in ('pending', 'under_review', 'needs_documents', 'approved', 'rejected', 'suspended')
  ),
  reason text not null default '' check (length(reason) <= 2000),
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index smartsell_platform_business_reviews_status_idx
  on private.smartsell_platform_business_reviews (status, updated_at desc);

create table private.smartsell_platform_support_tickets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.smartsell_businesses(id) on delete set null,
  subject text not null check (length(btrim(subject)) between 1 and 200),
  category text not null check (
    category in ('account', 'billing', 'inventory', 'sales', 'restaurant', 'technical', 'other')
  ),
  priority text not null default 'normal' check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  status text not null default 'open' check (
    status in ('open', 'in_progress', 'waiting_on_business', 'resolved', 'closed')
  ),
  assigned_admin uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id),
  resolution_note text not null default '' check (length(resolution_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index smartsell_platform_support_tickets_status_idx
  on private.smartsell_platform_support_tickets (status, updated_at desc);
create index smartsell_platform_support_tickets_business_idx
  on private.smartsell_platform_support_tickets (business_id, updated_at desc);

create table private.smartsell_platform_support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references private.smartsell_platform_support_tickets(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  body text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index smartsell_platform_support_messages_ticket_idx
  on private.smartsell_platform_support_messages (ticket_id, created_at);

create table private.smartsell_platform_settings (
  setting_key text primary key check (
    setting_key in (
      'site_name', 'support_email', 'support_phone', 'website_url',
      'contact_address', 'supported_countries', 'supported_currencies',
      'business_types'
    )
  ),
  setting_value jsonb not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table private.smartsell_platform_business_reviews enable row level security;
alter table private.smartsell_platform_support_tickets enable row level security;
alter table private.smartsell_platform_support_messages enable row level security;
alter table private.smartsell_platform_settings enable row level security;

revoke all on table private.smartsell_platform_business_reviews
  from public, anon, authenticated;
revoke all on table private.smartsell_platform_support_tickets
  from public, anon, authenticated;
revoke all on table private.smartsell_platform_support_messages
  from public, anon, authenticated;
revoke all on table private.smartsell_platform_settings
  from public, anon, authenticated;

create or replace function private.smartsell_platform_business_review_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.smartsell_platform_business_reviews (business_id, status)
  values (new.id, 'pending')
  on conflict (business_id) do nothing;
  return new;
end
$$;

create trigger smartsell_platform_business_review_created
after insert on public.smartsell_businesses
for each row execute function private.smartsell_platform_business_review_created();

revoke all on function private.smartsell_platform_business_review_created()
  from public, anon, authenticated;

create or replace function private.smartsell_platform_console(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  requested_action text := coalesce(command->>'action', '');
  requested_status text := coalesce(command->>'status', 'all');
  requested_search text := nullif(btrim(command->>'search'), '');
  target_business_id uuid;
  target_ticket_id uuid;
  target_review_status text;
  target_ticket_status text;
  target_priority text;
  target_category text;
  target_subject text;
  target_body text;
  target_resolution text;
  target_assignee uuid;
  target_setting_key text;
  target_setting_value jsonb;
  setting_row record;
  actor_is_admin boolean;
  member_row public.smartsell_members;
  result jsonb;
  start_time timestamptz;
  requested_range text := coalesce(command->>'range', '30d');
begin
  if actor_id is null then
    raise exception 'Sign in to continue' using errcode = '42501';
  end if;

  actor_is_admin := exists (
    select 1 from private.smartsell_platform_admins a
    where a.user_id = actor_id and a.active
  );

  if requested_action not in (
    'approvals_list', 'approval_update', 'restaurant_pos',
    'support_list', 'support_create', 'support_reply', 'support_update',
    'support_my_tickets', 'support_open', 'support_customer_reply',
    'settings_get', 'settings_save'
  ) then
    raise exception 'Unsupported platform console action'
      using errcode = '22023';
  end if;

  if requested_action like 'approval_%'
    or requested_action in ('approvals_list', 'restaurant_pos', 'settings_get', 'settings_save')
    or requested_action in ('support_list', 'support_create', 'support_reply', 'support_update') then
    if not actor_is_admin then
      raise exception 'Platform admin access required'
        using errcode = '42501';
    end if;
  end if;

  if requested_action = 'approvals_list' then
    if requested_status not in (
      'all', 'pending', 'under_review', 'needs_documents', 'approved', 'rejected', 'suspended', 'unreviewed'
    ) then
      raise exception 'Unsupported application status' using errcode = '22023';
    end if;

    select jsonb_build_object(
      'applications', coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at desc), '[]'::jsonb),
      'total', count(*)
    ) into result
    from (
      select b.id as business_id, b.name as business_name, b.category,
        b.custom_category, b.country, b.address, b.tax_id, b.email, b.phone,
        b.created_at, coalesce(r.status, 'unreviewed') as status,
        coalesce(r.reason, '') as reason, r.reviewed_by, r.updated_at as reviewed_at,
        owner.name as owner_name, owner.email as owner_email,
        (select count(*) from public.smartsell_branches br
          where br.business_id = b.id and br.active = 1) as active_branches
      from public.smartsell_businesses b
      left join private.smartsell_platform_business_reviews r on r.business_id = b.id
      left join lateral (
        select m.name, m.email
        from public.smartsell_members m
        where m.business_id = b.id and m.role = 'owner'
        order by m.created_at
        limit 1
      ) owner on true
      where (requested_status = 'all'
        or coalesce(r.status, 'unreviewed') = requested_status)
        and (requested_search is null
          or b.name ilike '%' || requested_search || '%'
          or coalesce(owner.email, '') ilike '%' || requested_search || '%'
          or coalesce(b.country, '') ilike '%' || requested_search || '%')
      order by b.created_at desc, b.id
      limit 250
    ) rows;
    return result;
  end if;

  if requested_action = 'approval_update' then
    target_business_id := nullif(command->>'business_id', '')::uuid;
    target_review_status := coalesce(command->>'status', '');
    target_body := coalesce(command->>'reason', '');

    if target_business_id is null
      or target_review_status not in (
        'pending', 'under_review', 'needs_documents', 'approved', 'rejected', 'suspended'
      )
      or length(target_body) > 2000 then
      raise exception 'Enter a valid business, review status, and reason'
        using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.smartsell_businesses b where b.id = target_business_id
    ) then
      raise exception 'Business not found' using errcode = 'P0002';
    end if;

    insert into private.smartsell_platform_business_reviews (
      business_id, status, reason, reviewed_by, updated_at
    ) values (
      target_business_id, target_review_status, target_body, actor_id, now()
    )
    on conflict (business_id) do update
      set status = excluded.status,
          reason = excluded.reason,
          reviewed_by = excluded.reviewed_by,
          updated_at = now();

    insert into public.smartsell_events (
      business_id, actor_id, category, entity, description, reference
    )
    select b.id, actor_id, 'Platform Approval', b.name,
      'Business review status set to ' || target_review_status
        || case when target_body = '' then '' else ': ' || target_body end,
      b.id::text
    from public.smartsell_businesses b
    where b.id = target_business_id;

    return jsonb_build_object('ok', true, 'status', target_review_status);
  end if;

  if requested_action = 'restaurant_pos' then
    if requested_range not in ('today', '7d', '30d', 'month') then
      raise exception 'Unsupported platform date range' using errcode = '22023';
    end if;
    start_time := case requested_range
      when 'today' then date_trunc('day', now())
      when '7d' then date_trunc('day', now()) - interval '6 days'
      when 'month' then date_trunc('month', now())
      else date_trunc('day', now()) - interval '29 days'
    end;

    select jsonb_build_object(
      'restaurants', coalesce((
        select jsonb_agg(to_jsonb(rows) order by rows.name)
        from (
          select b.id, b.name, b.country, b.currency,
            count(distinct br.id) filter (where br.active = 1) as branches,
            count(distinct t.id) filter (where t.active = 1) as dining_tables,
            count(distinct k.id) filter (where k.active = 1) as kitchen_stations,
            count(distinct o.id) filter (
              where o.status in ('open', 'submitted', 'preparing', 'ready', 'served')
            ) as open_orders
          from public.smartsell_businesses b
          left join public.smartsell_branches br on br.business_id = b.id
          left join public.smartsell_dining_tables t
            on t.business_id = b.id and t.branch_id = br.id
          left join public.smartsell_kitchen_stations k
            on k.business_id = b.id and k.branch_id = br.id
          left join public.smartsell_restaurant_orders o
            on o.business_id = b.id and o.branch_id = br.id
          where b.category = 'Restaurant'
            and (requested_search is null or b.name ilike '%' || requested_search || '%')
          group by b.id
          order by b.name
          limit 250
        ) rows
      ), '[]'::jsonb),
      'orders', coalesce((
        select jsonb_agg(to_jsonb(rows) order by rows.created_at desc)
        from (
          select o.id, o.reference, o.status, o.notes, o.created_at, o.updated_at,
            b.id as business_id, b.name as business_name, b.currency,
            br.name as branch_name, t.name as table_name,
            (select count(*) from public.smartsell_restaurant_order_items i
              where i.order_id = o.id) as item_count
          from public.smartsell_restaurant_orders o
          join public.smartsell_businesses b on b.id = o.business_id
          join public.smartsell_branches br on br.id = o.branch_id
            and br.business_id = o.business_id
          left join public.smartsell_dining_tables t on t.id = o.table_id
            and t.business_id = o.business_id and t.branch_id = o.branch_id
          where o.created_at >= start_time
            and (requested_search is null
              or o.reference ilike '%' || requested_search || '%'
              or b.name ilike '%' || requested_search || '%'
              or br.name ilike '%' || requested_search || '%')
          order by o.created_at desc, o.id desc
          limit 100
        ) rows
      ), '[]'::jsonb),
      'orders_by_status', coalesce((
        select jsonb_agg(jsonb_build_object('status', rows.status, 'count', rows.count)
          order by rows.status)
        from (
          select o.status, count(*) as count
          from public.smartsell_restaurant_orders o
          where o.created_at >= start_time
          group by o.status
        ) rows
      ), '[]'::jsonb),
      'sales_by_currency', coalesce((
        select jsonb_agg(jsonb_build_object(
          'currency', rows.currency, 'total', rows.total, 'count', rows.count
        ) order by rows.currency)
        from (
          select b.currency, sum(s.total)::numeric as total, count(*) as count
          from public.smartsell_sales s
          join public.smartsell_businesses b on b.id = s.business_id
          where b.category = 'Restaurant'
            and s.created_at >= start_time
            and s.status = 'completed'
          group by b.currency
        ) rows
      ), '[]'::jsonb),
      'range', requested_range
    ) into result;
    return result;
  end if;

  if requested_action = 'support_list' then
    if requested_status not in (
      'all', 'open', 'in_progress', 'waiting_on_business', 'resolved', 'closed'
    ) then
      raise exception 'Unsupported support ticket status' using errcode = '22023';
    end if;
    select jsonb_build_object(
      'tickets', coalesce(jsonb_agg(to_jsonb(rows) order by rows.updated_at desc), '[]'::jsonb),
      'total', count(*)
    ) into result
    from (
      select t.id, t.business_id, coalesce(b.name, 'Platform') as business_name,
        t.subject, t.category, t.priority, t.status, t.assigned_admin,
        t.created_by, t.resolution_note, t.created_at, t.updated_at,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', m.id, 'actor_id', m.actor_id,
            'actor_name', coalesce(member.name, u.email, 'Support team'),
            'body', m.body, 'created_at', m.created_at
          ) order by m.created_at)
          from private.smartsell_platform_support_messages m
          left join public.smartsell_members member on member.id = m.actor_id
          left join auth.users u on u.id = m.actor_id
          where m.ticket_id = t.id
        ), '[]'::jsonb) as messages
      from private.smartsell_platform_support_tickets t
      left join public.smartsell_businesses b on b.id = t.business_id
      where (requested_status = 'all' or t.status = requested_status)
        and (requested_search is null
          or t.subject ilike '%' || requested_search || '%'
          or coalesce(b.name, '') ilike '%' || requested_search || '%'
          or t.category ilike '%' || requested_search || '%')
      order by t.updated_at desc, t.id desc
      limit 200
    ) rows;
    return result;
  end if;

  if requested_action = 'support_my_tickets' then
    member_row := private.ss_member();
    select jsonb_build_object(
      'tickets', coalesce(jsonb_agg(to_jsonb(rows) order by rows.updated_at desc), '[]'::jsonb)
    ) into result
    from (
      select t.id, t.business_id, b.name as business_name,
        t.subject, t.category, t.priority, t.status, t.resolution_note,
        t.created_at, t.updated_at,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', m.id, 'actor_id', m.actor_id,
            'actor_name', coalesce(member.name, u.email, 'Support team'),
            'body', m.body, 'created_at', m.created_at
          ) order by m.created_at)
          from private.smartsell_platform_support_messages m
          left join public.smartsell_members member on member.id = m.actor_id
          left join auth.users u on u.id = m.actor_id
          where m.ticket_id = t.id
        ), '[]'::jsonb) as messages
      from private.smartsell_platform_support_tickets t
      join public.smartsell_businesses b on b.id = t.business_id
      where t.business_id = member_row.business_id
      order by t.updated_at desc, t.id desc
      limit 100
    ) rows;
    return result;
  end if;

  if requested_action in ('support_create', 'support_open') then
    if requested_action = 'support_open' then
      member_row := private.ss_member();
      target_business_id := member_row.business_id;
    else
      target_business_id := nullif(command->>'business_id', '')::uuid;
    end if;

    target_subject := btrim(coalesce(command->>'subject', ''));
    target_category := coalesce(command->>'category', 'other');
    target_priority := coalesce(command->>'priority', 'normal');
    target_body := btrim(coalesce(command->>'message', ''));

    if length(target_subject) not between 1 and 200
      or target_category not in ('account', 'billing', 'inventory', 'sales', 'restaurant', 'technical', 'other')
      or target_priority not in ('low', 'normal', 'high', 'urgent')
      or length(target_body) not between 1 and 5000 then
      raise exception 'Enter a valid subject, category, priority, and message'
        using errcode = '22023';
    end if;
    if target_business_id is not null and not exists (
      select 1 from public.smartsell_businesses b where b.id = target_business_id
    ) then
      raise exception 'Business not found' using errcode = 'P0002';
    end if;

    insert into private.smartsell_platform_support_tickets (
      business_id, subject, category, priority, created_by,
      assigned_admin, status
    ) values (
      target_business_id, target_subject, target_category, target_priority,
      actor_id, case when actor_is_admin then actor_id else null end, 'open'
    ) returning id into target_ticket_id;
    insert into private.smartsell_platform_support_messages (ticket_id, actor_id, body)
    values (target_ticket_id, actor_id, target_body);

    if target_business_id is not null then
      insert into public.smartsell_events (
        business_id, actor_id, category, entity, description, reference
      ) values (
        target_business_id, actor_id, 'Support', target_subject,
        'Support ticket opened', target_ticket_id::text
      );
    end if;

    return jsonb_build_object('ok', true, 'ticket_id', target_ticket_id);
  end if;

  if requested_action in ('support_reply', 'support_customer_reply') then
    target_ticket_id := nullif(command->>'ticket_id', '')::uuid;
    target_body := btrim(coalesce(command->>'message', ''));
    if target_ticket_id is null or length(target_body) not between 1 and 5000 then
      raise exception 'Choose a ticket and enter a message'
        using errcode = '22023';
    end if;

    if requested_action = 'support_customer_reply' then
      member_row := private.ss_member();
      if not exists (
        select 1 from private.smartsell_platform_support_tickets t
        where t.id = target_ticket_id and t.business_id = member_row.business_id
          and t.status not in ('resolved', 'closed')
      ) then
        raise exception 'Ticket not found or no longer accepts replies'
          using errcode = 'P0002';
      end if;
    elsif not exists (
      select 1 from private.smartsell_platform_support_tickets t
      where t.id = target_ticket_id
    ) then
      raise exception 'Ticket not found' using errcode = 'P0002';
    end if;

    insert into private.smartsell_platform_support_messages (ticket_id, actor_id, body)
    values (target_ticket_id, actor_id, target_body);
    update private.smartsell_platform_support_tickets
    set updated_at = now(),
        status = case when requested_action = 'support_customer_reply'
          and status = 'waiting_on_business' then 'in_progress' else status end
    where id = target_ticket_id;
    return jsonb_build_object('ok', true);
  end if;

  if requested_action = 'support_update' then
    target_ticket_id := nullif(command->>'ticket_id', '')::uuid;
    target_ticket_status := coalesce(command->>'status', '');
    target_priority := coalesce(command->>'priority', '');
    target_resolution := coalesce(command->>'resolution_note', '');
    target_assignee := nullif(command->>'assigned_admin', '')::uuid;
    if target_ticket_id is null
      or target_ticket_status not in ('open', 'in_progress', 'waiting_on_business', 'resolved', 'closed')
      or target_priority not in ('low', 'normal', 'high', 'urgent')
      or length(target_resolution) > 2000 then
      raise exception 'Enter a valid ticket status, priority, and resolution note'
        using errcode = '22023';
    end if;
    if target_assignee is not null and not exists (
      select 1 from private.smartsell_platform_admins a
      where a.user_id = target_assignee and a.active
    ) then
      raise exception 'Assigned user is not an active platform administrator'
        using errcode = '22023';
    end if;
    update private.smartsell_platform_support_tickets t
    set status = target_ticket_status, priority = target_priority,
        resolution_note = target_resolution, assigned_admin = target_assignee,
        updated_at = now()
    where t.id = target_ticket_id;
    if not found then
      raise exception 'Ticket not found' using errcode = 'P0002';
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if requested_action = 'settings_get' then
    select jsonb_build_object(
      'settings', coalesce(jsonb_object_agg(s.setting_key, s.setting_value), '{}'::jsonb)
    ) into result
    from private.smartsell_platform_settings s;
    return result;
  end if;

  if requested_action = 'settings_save' then
    if jsonb_typeof(command->'settings') is distinct from 'object' then
      raise exception 'Settings must be an object' using errcode = '22023';
    end if;

    for setting_row in
      select key, value from jsonb_each(command->'settings')
    loop
      target_setting_key := setting_row.key;
      target_setting_value := setting_row.value;
      if target_setting_key not in (
        'site_name', 'support_email', 'support_phone', 'website_url',
        'contact_address', 'supported_countries', 'supported_currencies', 'business_types'
      ) then
        raise exception 'Unsupported platform setting: %', target_setting_key
          using errcode = '22023';
      end if;
      if target_setting_key in (
        'supported_countries', 'supported_currencies', 'business_types'
      ) then
        if jsonb_typeof(target_setting_value) <> 'array'
          or jsonb_array_length(target_setting_value) > 50
          or exists (
            select 1 from jsonb_array_elements(target_setting_value) as item(value)
            where jsonb_typeof(item.value) <> 'string'
              or length(btrim(item.value #>> '{}')) not between 1 and 80
          ) then
          raise exception 'Invalid list setting: %', target_setting_key
            using errcode = '22023';
        end if;
      else
        if jsonb_typeof(target_setting_value) <> 'string'
          or length(target_setting_value #>> '{}') > 300 then
          raise exception 'Invalid text setting: %', target_setting_key
            using errcode = '22023';
        end if;
        if target_setting_key = 'site_name'
          and length(btrim(target_setting_value #>> '{}')) not between 1 and 80 then
          raise exception 'Website name must be 1–80 characters'
            using errcode = '22023';
        end if;
        if target_setting_key = 'support_email'
          and (target_setting_value #>> '{}') <> ''
          and (target_setting_value #>> '{}') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
          raise exception 'Enter a valid support email'
            using errcode = '22023';
        end if;
        if target_setting_key = 'website_url'
          and (target_setting_value #>> '{}') <> ''
          and (target_setting_value #>> '{}') !~ '^https?://' then
          raise exception 'Website URL must begin with http:// or https://'
            using errcode = '22023';
        end if;
      end if;

      insert into private.smartsell_platform_settings (
        setting_key, setting_value, updated_by, updated_at
      ) values (
        target_setting_key, target_setting_value, actor_id, now()
      )
      on conflict (setting_key) do update
        set setting_value = excluded.setting_value,
            updated_by = excluded.updated_by,
            updated_at = now();
    end loop;
    return jsonb_build_object('ok', true);
  end if;

  raise exception 'Unsupported platform console action'
    using errcode = '22023';
end
$$;

revoke all on function private.smartsell_platform_console(jsonb)
  from public, anon, authenticated;

create or replace function public.smartsell_platform_console(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.smartsell_platform_console(command);
$$;

revoke all on function public.smartsell_platform_console(jsonb) from public, anon;
grant execute on function private.smartsell_platform_console(jsonb) to authenticated;
grant execute on function public.smartsell_platform_console(jsonb) to authenticated;