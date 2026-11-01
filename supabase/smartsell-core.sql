-- Smartsell cloud domain. Amounts use currency minor units; stock supports thousandths.
-- Authenticated clients use explicitly authorized RPCs; direct table access is denied.
create schema if not exists private;
create table public.smartsell_businesses (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 200),
 currency text not null default 'TZS' check(currency ~ '^[A-Z]{3}$'), country text not null, timezone text not null,
 email text not null default '', phone text not null default '', address text not null default '', tax_id text not null default '', category text not null default 'Retail', custom_category text not null default '', created_at timestamptz not null default now()
);
create table public.smartsell_branches (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.smartsell_businesses(id),
 name text not null, address text not null default '', phone text not null default '', active integer not null default 1 check(active in (0,1)), unique(id,business_id)
);
create table public.smartsell_members (
 id uuid primary key references auth.users(id),business_id uuid not null references public.smartsell_businesses(id),branch_id uuid not null,
 name text not null,email text not null,role text not null check(role in ('owner','manager','cashier')),active integer not null default 1 check(active in (0,1)),theme text not null default 'dark' check(theme in ('dark','light')),
 created_at timestamptz not null default now(),foreign key(branch_id,business_id) references public.smartsell_branches(id,business_id)
);
create table public.smartsell_invitations(id uuid primary key,business_id uuid not null references public.smartsell_businesses(id),branch_id uuid not null,name text not null,email text not null,role text not null check(role in ('manager','cashier')),created_at timestamptz not null default now(),foreign key(branch_id,business_id) references public.smartsell_branches(id,business_id),unique(email));
create table public.smartsell_products (
 id uuid primary key,business_id uuid not null references public.smartsell_businesses(id),name text not null,sku text not null,barcode text not null default '',category text not null default 'General',unit text not null default 'piece',
 cost bigint not null check(cost between 0 and 1000000000),price bigint not null check(price between 0 and 1000000000),threshold integer not null check(threshold between 0 and 100000),active integer not null default 1,version integer not null default 1,unique(business_id,sku),unique(id,business_id)
);
create table public.smartsell_stock (
 business_id uuid not null,product_id uuid not null,branch_id uuid not null,quantity numeric(12,3) not null check(quantity between 0 and 100000000),primary key(product_id,branch_id),foreign key(product_id,business_id) references public.smartsell_products(id,business_id),foreign key(branch_id,business_id) references public.smartsell_branches(id,business_id)
);
create table public.smartsell_parties(id uuid primary key,business_id uuid not null references public.smartsell_businesses(id),kind text not null check(kind in ('customer','supplier')),name text not null,email text not null default '',phone text not null default '',address text not null default '',unique(id,business_id));
create table public.smartsell_sales (
 id uuid primary key,business_id uuid not null references public.smartsell_businesses(id),branch_id uuid not null,customer_id uuid,reference text not null unique,total bigint not null check(total between 0 and 1000000000),paid bigint not null check(paid>=0 and paid<=total),discount bigint not null check(discount>=0),tax bigint not null check(tax>=0),method text not null check(method in ('cash','credit')),status text not null default 'completed' check(status in ('completed','refunded')),created_at timestamptz not null,received_at timestamptz not null default now(),actor_id uuid not null references auth.users(id),unique(id,business_id),foreign key(branch_id,business_id) references public.smartsell_branches(id,business_id),foreign key(customer_id,business_id) references public.smartsell_parties(id,business_id)
);
create table public.smartsell_sale_items(id uuid primary key default gen_random_uuid(),business_id uuid not null,sale_id uuid not null,product_id uuid not null,name text not null,sku text not null,quantity integer not null check(quantity between 1 and 100000),price bigint not null check(price>=0),cost bigint not null check(cost>=0),foreign key(sale_id,business_id) references public.smartsell_sales(id,business_id),foreign key(product_id,business_id) references public.smartsell_products(id,business_id));
create table public.smartsell_purchases(id uuid primary key,business_id uuid not null references public.smartsell_businesses(id),branch_id uuid not null,supplier_id uuid not null,product_id uuid not null,quantity integer not null check(quantity between 1 and 100000),cost bigint not null check(cost between 0 and 1000000000),total bigint not null check(total between 0 and 1000000000),paid bigint not null default 0 check(paid>=0 and paid<=total),status text not null default 'ordered' check(status in ('ordered','received')),reference text not null unique,created_at timestamptz not null,foreign key(branch_id,business_id) references public.smartsell_branches(id,business_id),foreign key(supplier_id,business_id) references public.smartsell_parties(id,business_id),foreign key(product_id,business_id) references public.smartsell_products(id,business_id));
create table public.smartsell_expenses(id uuid primary key,business_id uuid not null references public.smartsell_businesses(id),branch_id uuid not null,name text not null,category text not null,amount bigint not null check(amount between 1 and 1000000000),date date not null,created_at timestamptz not null,foreign key(branch_id,business_id) references public.smartsell_branches(id,business_id));
create table public.smartsell_movements(id uuid primary key default gen_random_uuid(),business_id uuid not null,branch_id uuid not null,product_id uuid not null,delta numeric(12,3) not null,reason text not null,reference text not null,created_at timestamptz not null default now(),foreign key(branch_id,business_id) references public.smartsell_branches(id,business_id),foreign key(product_id,business_id) references public.smartsell_products(id,business_id));
create table public.smartsell_events(id uuid primary key default gen_random_uuid(),business_id uuid not null references public.smartsell_businesses(id),branch_id uuid,actor_id uuid not null references auth.users(id),category text not null,entity text not null,description text not null,reference text not null,amount bigint not null default 0,created_at timestamptz not null default now(),foreign key(branch_id,business_id) references public.smartsell_branches(id,business_id));
create table public.smartsell_operations(id uuid primary key,business_id uuid not null references public.smartsell_businesses(id),actor_id uuid not null references auth.users(id),payload jsonb not null,response jsonb not null,created_at timestamptz not null default now());
create table public.smartsell_exports(id uuid primary key,business_id uuid not null references public.smartsell_businesses(id),branch_id uuid not null,name text not null,scope text not null,content text not null check(octet_length(content)<=4000000),created_at timestamptz not null default now(),foreign key(branch_id,business_id) references public.smartsell_branches(id,business_id));
create table public.smartsell_dining_tables (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.smartsell_businesses(id),branch_id uuid not null,
 name text not null,seats integer not null default 2 check(seats between 1 and 100),active integer not null default 1 check(active in (0,1)),
 unique(branch_id,name),unique(id,business_id,branch_id),foreign key(branch_id,business_id) references public.smartsell_branches(id,business_id)
);
create table public.smartsell_kitchen_stations (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.smartsell_businesses(id),branch_id uuid not null,
 name text not null,active integer not null default 1 check(active in (0,1)),
 unique(branch_id,name),unique(id,business_id,branch_id),foreign key(branch_id,business_id) references public.smartsell_branches(id,business_id)
);
create table public.smartsell_restaurant_orders (
 id uuid primary key,business_id uuid not null references public.smartsell_businesses(id),branch_id uuid not null,table_id uuid not null,
 reference text not null unique,status text not null check(status in ('open','submitted','preparing','ready','served','closed','cancelled')),
 notes text not null default '',created_by uuid not null references auth.users(id),created_at timestamptz not null,updated_at timestamptz not null,
 unique(id,business_id,branch_id),foreign key(branch_id,business_id) references public.smartsell_branches(id,business_id),
 foreign key(table_id,business_id,branch_id) references public.smartsell_dining_tables(id,business_id,branch_id)
);
create table public.smartsell_restaurant_order_items (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.smartsell_businesses(id),branch_id uuid not null,
 order_id uuid not null,product_id uuid not null,station_id uuid,name text not null,sku text not null,
 quantity numeric(12,3) not null check(quantity between 0.001 and 100000),price bigint not null check(price>=0),
 cost bigint not null check(cost>=0),status text not null default 'queued' check(status in ('queued','preparing','ready','served','cancelled')),
 foreign key(order_id,business_id,branch_id) references public.smartsell_restaurant_orders(id,business_id,branch_id) on delete cascade,
 foreign key(product_id,business_id) references public.smartsell_products(id,business_id),
 foreign key(station_id,business_id,branch_id) references public.smartsell_kitchen_stations(id,business_id,branch_id)
);
do $$ declare t text; begin
 foreach t in array array['businesses','branches','members','invitations','products','stock','parties','sales','sale_items','purchases','expenses','movements','events','operations','exports','dining_tables','kitchen_stations','restaurant_orders','restaurant_order_items'] loop
 execute format('alter table public.smartsell_%I enable row level security',t);
 execute format('revoke all on public.smartsell_%I from anon, authenticated',t);
 if t<>'businesses' then execute format('create index on public.smartsell_%I (business_id)',t); end if;
 end loop;
end $$;
revoke all on public.smartsell_dining_tables,public.smartsell_kitchen_stations,public.smartsell_restaurant_orders,public.smartsell_restaurant_order_items from public,anon,authenticated;
create index on public.smartsell_sales(business_id,branch_id,created_at);
create index on public.smartsell_events(business_id,branch_id,created_at);
create index on public.smartsell_members(branch_id);
create index on public.smartsell_invitations(branch_id);
create index on public.smartsell_stock(branch_id);
create index on public.smartsell_sale_items(sale_id);
create index on public.smartsell_sale_items(product_id);
create index on public.smartsell_purchases(supplier_id);
create index on public.smartsell_purchases(product_id);
create index on public.smartsell_sales(customer_id);
create index on public.smartsell_sales(actor_id);
create index on public.smartsell_operations(actor_id);
create index on public.smartsell_events(actor_id);
create index on public.smartsell_movements(product_id);
create index on public.smartsell_movements(branch_id);
create index on public.smartsell_purchases(branch_id);
create index on public.smartsell_expenses(branch_id);
create index on public.smartsell_exports(branch_id);
create index on public.smartsell_dining_tables(branch_id,business_id);
create index on public.smartsell_kitchen_stations(branch_id,business_id);
create index on public.smartsell_restaurant_orders(business_id,branch_id,created_at desc);
create index on public.smartsell_restaurant_orders(table_id,business_id,branch_id);
create unique index smartsell_restaurant_one_active_order_per_table_idx on public.smartsell_restaurant_orders(table_id) where status in ('open','submitted','preparing','ready','served');
create index on public.smartsell_restaurant_order_items(order_id,status);
create index on public.smartsell_restaurant_order_items(product_id,business_id);
create index on public.smartsell_restaurant_order_items(station_id,business_id,branch_id) where station_id is not null;

create function private.ss_assert(ok boolean,message text) returns void language plpgsql set search_path='' as $$ begin if ok is not true then raise exception '%',message; end if; end $$;
create function private.ss_text(v jsonb,k text,required boolean default true) returns text language plpgsql immutable set search_path='' as $$ declare s text:=trim(coalesce(v->>k,'')); begin perform private.ss_assert(length(s)<=500 and (not required or length(s)>0),'Invalid '||k);return s;end $$;
create function private.ss_int(v jsonb,k text,lo bigint default 0,hi bigint default 1000000000) returns bigint language plpgsql immutable set search_path='' as $$ declare n bigint;begin perform private.ss_assert(coalesce(v->>k,'') ~ '^-?[0-9]+$','Invalid integer '||k);n:=(v->>k)::bigint;perform private.ss_assert(n between lo and hi,k||' is outside the supported range');return n;end $$;
create function private.ss_member() returns public.smartsell_members language plpgsql stable security definer set search_path='' as $$ declare m public.smartsell_members;begin perform private.ss_assert(auth.uid() is not null,'Sign in to continue');select * into m from public.smartsell_members where id=auth.uid() and active=1;perform private.ss_assert(found,'No active Smartsell membership. Sign in and finish business setup.');return m;end $$;
create function private.ss_branch(m public.smartsell_members,b uuid) returns void language plpgsql stable set search_path='' as $$ begin perform private.ss_assert(exists(select 1 from public.smartsell_branches where id=b and business_id=m.business_id and active=1) and (m.role='owner' or m.branch_id=b),'Branch access denied');end $$;
create function private.ss_movement(biz uuid,b uuid,p uuid,d numeric,reason text,ref text) returns void language plpgsql set search_path='' as $$ declare current_quantity numeric(12,3);begin
 perform private.ss_assert(d=round(d,3),'Use up to three decimal places.');
 insert into public.smartsell_stock(business_id,product_id,branch_id,quantity) values(biz,p,b,0) on conflict do nothing;
 select quantity into current_quantity from public.smartsell_stock where product_id=p and branch_id=b for update;
 perform private.ss_assert(current_quantity+d between 0 and 100000000,'Insufficient stock or quantity exceeds limit');
 update public.smartsell_stock set quantity=current_quantity+d where product_id=p and branch_id=b;
 insert into public.smartsell_movements(business_id,branch_id,product_id,delta,reason,reference) values(biz,b,p,d,reason,ref);
end $$;
create function private.ss_movement(biz uuid,b uuid,p uuid,d integer,reason text,ref text) returns void language plpgsql set search_path='' as $$ begin
 perform private.ss_movement(biz,b,p,d::numeric,reason,ref);
end $$;
create function private.ss_event(m public.smartsell_members,b uuid,category text,entity text,description text,ref text,amount bigint default 0) returns void language sql set search_path='' as $$ insert into public.smartsell_events(business_id,branch_id,actor_id,category,entity,description,reference,amount) values(m.business_id,b,m.id,category,entity,description,ref,amount); $$;

create function private.smartsell_identity() returns jsonb language plpgsql security definer set search_path='' as $$ declare m public.smartsell_members;inv public.smartsell_invitations; begin
 perform private.ss_assert(auth.uid() is not null,'Sign in to continue');
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
 select * into m from public.smartsell_members where id=auth.uid();
 if not found then
  select i.* into inv from public.smartsell_invitations i join auth.users u on lower(u.email)=lower(i.email) where u.id=auth.uid() and u.email_confirmed_at is not null;
  if found then insert into public.smartsell_members(id,business_id,branch_id,name,email,role) values(auth.uid(),inv.business_id,inv.branch_id,inv.name,inv.email,inv.role) returning * into m;delete from public.smartsell_invitations where id=inv.id;end if;
 end if;
 if m.id is null then return null;end if;
 perform private.ss_assert(m.active=1,'Your Smartsell membership is disabled');return to_jsonb(m);
end $$;
create function public.smartsell_identity() returns jsonb language sql security invoker set search_path='' as $$ select private.smartsell_identity(); $$;

create function private.smartsell_onboard(v jsonb) returns jsonb language plpgsql security definer set search_path='' as $$ declare biz uuid:=gen_random_uuid();br uuid:=gen_random_uuid();identity jsonb;email text;category text:=coalesce(v->>'category','Retail');custom_category text:=coalesce(v->>'custom_category','');begin
 identity:=private.smartsell_identity();if identity is not null then return identity;end if;
 perform private.ss_assert(exists(select 1 from pg_timezone_names where name=v->>'timezone'),'Invalid timezone');
 perform private.ss_assert(coalesce(v->>'currency','TZS') ~ '^[A-Z]{3}$','Currency must be a three-letter ISO code');
 perform private.ss_assert(category in ('Retail','Grocery','Fashion','Electronics','Restaurant','Pharmacy','Beauty & Personal Care','Hardware','Other'),'Invalid business category');
 perform private.ss_assert(category<>'Other' or length(custom_category)>0,'Enter your business category');
 select u.email into email from auth.users u where u.id=auth.uid();
 insert into public.smartsell_businesses(id,name,currency,country,timezone,category,custom_category) values(biz,private.ss_text(v,'business'),coalesce(v->>'currency','TZS'),private.ss_text(v,'country'),v->>'timezone',category,custom_category);
 insert into public.smartsell_branches(id,business_id,name) values(br,biz,private.ss_text(v,'branch'));
 insert into public.smartsell_members(id,business_id,branch_id,name,email,role) values(auth.uid(),biz,br,private.ss_text(v,'name'),email,'owner');return private.smartsell_identity();
end $$;
create function public.smartsell_onboard(v jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.smartsell_onboard(v); $$;

create function private.smartsell_workspace(b uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare m public.smartsell_members:=private.ss_member();result jsonb;begin
 b:=coalesce(b,m.branch_id);perform private.ss_branch(m,b);
 select jsonb_build_object(
 'user',to_jsonb(m),'business',(select to_jsonb(t) from public.smartsell_businesses t where id=m.business_id),
 'branches',coalesce((select jsonb_agg(t order by name) from public.smartsell_branches t where business_id=m.business_id and (m.role='owner' or id=m.branch_id)),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('stock',coalesce(s.quantity,0),'cost',case when m.role='cashier' then 0 else p.cost end) order by p.name) from public.smartsell_products p left join public.smartsell_stock s on s.product_id=p.id and s.branch_id=b where p.business_id=m.business_id and p.active=1),'[]'::jsonb),
 'sales',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('customer',coalesce(p.name,'Walk-in customer'),'actor',u.name) order by s.created_at desc) from public.smartsell_sales s left join public.smartsell_parties p on p.id=s.customer_id join public.smartsell_members u on u.id=s.actor_id where s.business_id=m.business_id and s.branch_id=b and (m.role<>'cashier' or s.actor_id=m.id)),'[]'::jsonb),
 'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('cost',case when m.role='cashier' then 0 else i.cost end)) from public.smartsell_sale_items i join public.smartsell_sales s on s.id=i.sale_id where s.business_id=m.business_id and s.branch_id=b and (m.role<>'cashier' or s.actor_id=m.id)),'[]'::jsonb),
 'parties',coalesce((select jsonb_agg(t order by name) from public.smartsell_parties t where business_id=m.business_id and (m.role<>'cashier' or kind='customer')),'[]'::jsonb),
 'purchases',case when m.role='cashier' then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('product',p.name,'supplier',s.name) order by o.created_at desc) from public.smartsell_purchases o join public.smartsell_products p on p.id=o.product_id join public.smartsell_parties s on s.id=o.supplier_id where o.business_id=m.business_id and o.branch_id=b),'[]'::jsonb) end,
 'expenses',case when m.role='cashier' then '[]'::jsonb else coalesce((select jsonb_agg(t order by date desc) from public.smartsell_expenses t where business_id=m.business_id and branch_id=b),'[]'::jsonb) end,
 'events',case when m.role='cashier' then '[]'::jsonb else coalesce((select jsonb_agg(x order by created_at desc) from (select e.*,u.name actor from public.smartsell_events e join public.smartsell_members u on u.id=e.actor_id where e.business_id=m.business_id and (e.branch_id=b or e.branch_id is null) order by e.created_at desc limit 2000)x),'[]'::jsonb) end,
 'movements',case when m.role='cashier' then '[]'::jsonb else coalesce((select jsonb_agg(t order by created_at desc) from public.smartsell_movements t where business_id=m.business_id and branch_id=b),'[]'::jsonb) end,
 'staff',case when m.role<>'owner' then '[]'::jsonb else coalesce((select jsonb_agg(x order by name) from(select to_jsonb(t) as ignored,t.* from public.smartsell_members t where business_id=m.business_id)x),'[]'::jsonb)||coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('active',0,'invited',true)) from public.smartsell_invitations i where business_id=m.business_id),'[]'::jsonb) end,
 'exports',case when m.role='cashier' then '[]'::jsonb else coalesce((select jsonb_agg(t order by created_at desc) from public.smartsell_exports t where business_id=m.business_id and branch_id=b),'[]'::jsonb) end
 ) into result;return result;
end $$;
create function public.smartsell_workspace(b uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.smartsell_workspace(b); $$;

create function private.smartsell_command(command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare m public.smartsell_members:=private.ss_member();v jsonb:=command->'body';path text:=command->>'path';method text:=command->>'method';oid uuid:=(command->>'id')::uuid;eid uuid:=(command->>'entity_id')::uuid;b uuid;target uuid;p public.smartsell_products;s public.smartsell_sales;o public.smartsell_purchases;member public.smartsell_members;line jsonb;prior public.smartsell_operations;result jsonb:='{}';ref text;qty integer;cost bigint;price bigint;subtotal bigint:=0;discount bigint;tax bigint;total bigint;paid bigint;date_at timestamptz:=(command->>'created_at')::timestamptz;category text:='Business';entity text:='';description text;impact bigint:=0;
begin
 perform private.ss_assert(oid is not null and eid is not null and method in ('POST','PUT'),'Invalid operation');
 perform pg_advisory_xact_lock(hashtextextended(m.business_id::text,0));
 select * into prior from public.smartsell_operations where id=oid;
 if found then perform private.ss_assert(prior.business_id=m.business_id and prior.actor_id=m.id and prior.payload=command,'Operation key reused with a different request');return prior.response;end if;
 perform private.ss_assert(date_at between now()-interval '7 days' and now()+interval '5 minutes','Device operation is too old or its clock is incorrect');
 b:=coalesce(nullif(v->>'branch_id','')::uuid,m.branch_id);perform private.ss_branch(m,b);
 if path<>'/sales' then perform private.ss_assert(m.role in ('owner','manager') or path='/profile','Your role does not permit this action');end if;
 if path='/products' or (path like '/products/%' and method='PUT') then
  category:='Products';cost:=private.ss_int(v,'cost');price:=private.ss_int(v,'price');qty:=private.ss_int(v,'threshold',0,100000);entity:=private.ss_text(v,'name');perform private.ss_assert(length(private.ss_text(v,'sku'))<=200,'SKU too long');
  if method='PUT' then target:=split_part(path,'/',3)::uuid;select * into p from public.smartsell_products where id=target and business_id=m.business_id;perform private.ss_assert(found,'Product not found');perform private.ss_assert(v->>'version' is not null and p.version=(v->>'version')::integer,'Product changed on another device. Review before retrying');
   update public.smartsell_products set name=entity,sku=private.ss_text(v,'sku'),barcode=private.ss_text(v,'barcode',false),category=private.ss_text(v,'category'),unit=private.ss_text(v,'unit'),cost=cost,price=price,threshold=qty,version=version+1 where id=target;
   eid:=target;description:='Product updated';
  else insert into public.smartsell_products(id,business_id,name,sku,barcode,category,unit,cost,price,threshold) values(eid,m.business_id,entity,private.ss_text(v,'sku'),private.ss_text(v,'barcode',false),private.ss_text(v,'category'),private.ss_text(v,'unit'),cost,price,qty);qty:=private.ss_int(v,'stock',0,100000);perform private.ss_movement(m.business_id,b,eid,qty,'Opening stock',eid::text);impact:=qty;description:='Product created';end if;
 elsif path='/stock' then
  target:=(v->>'product_id')::uuid;select * into p from public.smartsell_products where id=target and business_id=m.business_id;perform private.ss_assert(found,'Product not found');qty:=private.ss_int(v,'delta',-100000,100000);perform private.ss_assert(qty<>0,'Quantity cannot be zero');
  perform private.ss_movement(m.business_id,b,target,qty,private.ss_text(v,'reason'),oid::text);
  if v->>'destination' is not null then perform private.ss_assert(m.role='owner' and (v->>'destination')::uuid<>b and qty<0,'Invalid transfer');perform private.ss_branch(m,(v->>'destination')::uuid);perform private.ss_movement(m.business_id,(v->>'destination')::uuid,target,-qty,'Transfer received',oid::text);end if;
  category:='Products';entity:=p.name;description:=v->>'reason';impact:=qty;
 elsif path='/parties' then
  perform private.ss_assert(v->>'kind' in ('customer','supplier'),'Invalid contact type');entity:=private.ss_text(v,'name');insert into public.smartsell_parties values(eid,m.business_id,v->>'kind',entity,private.ss_text(v,'email',false),private.ss_text(v,'phone',false),private.ss_text(v,'address',false));category:=case when v->>'kind'='customer' then 'Customers' else 'Suppliers' end;description:='Contact created';
 elsif path='/sales' then
  perform private.ss_assert(jsonb_typeof(v->'items')='array' and jsonb_array_length(v->'items') between 1 and 200,'Empty or invalid cart');
  perform private.ss_assert((select count(distinct x->>'product_id')=count(*) from jsonb_array_elements(v->'items')x),'Duplicate cart lines');
  for line in select value from jsonb_array_elements(v->'items') loop
   select * into p from public.smartsell_products where id=(line->>'product_id')::uuid and business_id=m.business_id and active=1;perform private.ss_assert(found,'Product not found');qty:=private.ss_int(line,'quantity',1,100000);subtotal:=subtotal+p.price*qty;
  end loop;
  discount:=private.ss_int(v,'discount');qty:=private.ss_int(v,'tax_bps',0,10000);perform private.ss_assert(discount<=subtotal,'Discount exceeds subtotal');perform private.ss_assert(m.role<>'cashier' or(discount=0 and qty=0),'Manager authorization required for tax or discount overrides');tax:=(subtotal-discount)*qty/10000+case when ((subtotal-discount)*qty)%10000>=5000 then 1 else 0 end;total:=subtotal-discount+tax;perform private.ss_assert(total<=1000000000 and total=(v->>'expected_total')::bigint,'Prices changed or sale total exceeds limit');
  perform private.ss_assert(v->>'method' in ('cash','credit'),'Unsupported payment method');
  target:=nullif(v->>'customer_id','')::uuid;
  if target is not null then perform private.ss_assert(exists(select 1 from public.smartsell_parties where id=target and business_id=m.business_id and kind='customer'),'Customer not found');end if;
  if v->>'method'='credit' then perform private.ss_assert(m.role<>'cashier' and target is not null,'Credit sales require a customer and manager');paid:=0;else paid:=private.ss_int(v,'tendered');perform private.ss_assert(paid>=total,'Cash received is less than total');end if;
  ref:='SS-'||upper(replace(eid::text,'-',''));insert into public.smartsell_sales(id,business_id,branch_id,customer_id,reference,total,paid,discount,tax,method,created_at,actor_id) values(eid,m.business_id,b,target,ref,total,case when v->>'method'='cash' then total else 0 end,discount,tax,v->>'method',date_at,m.id);
  for line in select value from jsonb_array_elements(v->'items') loop
   select * into p from public.smartsell_products where id=(line->>'product_id')::uuid and business_id=m.business_id;qty:=(line->>'quantity')::integer;
   perform private.ss_movement(m.business_id,b,p.id,-qty,'Sale',ref);insert into public.smartsell_sale_items(business_id,sale_id,product_id,name,sku,quantity,price,cost) values(m.business_id,eid,p.id,p.name,p.sku,qty,p.price,p.cost);
  end loop;
  result:=jsonb_build_object('id',eid,'reference',ref,'total',total,'change',case when v->>'method'='cash' then paid-total else 0 end);category:='Customers';entity:=coalesce((select name from public.smartsell_parties where id=target),'Walk-in customer');description:='Sale · '||(v->>'method');impact:=total;
 elsif path like '/sales/%/refund' then
  target:=split_part(path,'/',3)::uuid;select * into s from public.smartsell_sales where id=target and business_id=m.business_id;perform private.ss_assert(found,'Sale not found');b:=s.branch_id;perform private.ss_branch(m,b);perform private.ss_assert(s.status='completed','Sale already refunded');
  for line in select to_jsonb(i) from public.smartsell_sale_items i where sale_id=s.id loop perform private.ss_movement(m.business_id,b,(line->>'product_id')::uuid,(line->>'quantity')::integer,'Full refund',s.reference);end loop;
  update public.smartsell_sales set status='refunded' where id=s.id;category:='Customers';entity:=s.reference;description:='Full refund · return cash separately';impact:=-s.paid;
 elsif path='/purchases' then
  target:=(v->>'product_id')::uuid;perform private.ss_assert(exists(select 1 from public.smartsell_products where id=target and business_id=m.business_id),'Product not found');perform private.ss_assert(exists(select 1 from public.smartsell_parties where id=(v->>'supplier_id')::uuid and business_id=m.business_id and kind='supplier'),'Supplier not found');qty:=private.ss_int(v,'quantity',1,100000);cost:=private.ss_int(v,'cost');total:=qty*cost;perform private.ss_assert(total<=1000000000,'Purchase exceeds limit');
  insert into public.smartsell_purchases(id,business_id,branch_id,supplier_id,product_id,quantity,cost,total,reference,created_at) values(eid,m.business_id,b,(v->>'supplier_id')::uuid,target,qty,cost,total,'PO-'||upper(replace(eid::text,'-','')),date_at);category:='Suppliers';entity:='Purchase order';description:='Purchase ordered · awaiting receipt';impact:=total;
 elsif path like '/purchases/%/receive' then
  target:=split_part(path,'/',3)::uuid;select * into o from public.smartsell_purchases where id=target and business_id=m.business_id;perform private.ss_assert(found,'Purchase not found');b:=o.branch_id;perform private.ss_branch(m,b);perform private.ss_assert(o.status='ordered','Purchase already received');perform private.ss_movement(m.business_id,b,o.product_id,o.quantity,'Goods received',o.reference);update public.smartsell_purchases set status='received' where id=o.id;category:='Suppliers';entity:=o.reference;description:='Goods received; supplier payable created';impact:=o.total;
 elsif path='/payments' then
  target:=(v->>'id')::uuid;paid:=private.ss_int(v,'amount',1);perform private.ss_assert(v->>'kind' in ('sales','purchases'),'Invalid payment target');
  if v->>'kind'='sales' then select * into s from public.smartsell_sales where id=target and business_id=m.business_id and status='completed';perform private.ss_assert(found,'Completed sale not found');b:=s.branch_id;perform private.ss_branch(m,b);perform private.ss_assert(paid<=s.total-s.paid,'Payment exceeds balance');update public.smartsell_sales set paid=smartsell_sales.paid+paid where id=target;category:='Customers';entity:=s.reference;
  else select * into o from public.smartsell_purchases where id=target and business_id=m.business_id and status='received';perform private.ss_assert(found,'Received purchase not found');b:=o.branch_id;perform private.ss_branch(m,b);perform private.ss_assert(paid<=o.total-o.paid,'Payment exceeds balance');update public.smartsell_purchases set paid=smartsell_purchases.paid+paid where id=target;category:='Suppliers';entity:=o.reference;end if;description:='Cash payment recorded';impact:=paid;
 elsif path='/expenses' then
  paid:=private.ss_int(v,'amount',1);entity:=private.ss_text(v,'name');insert into public.smartsell_expenses values(eid,m.business_id,b,entity,private.ss_text(v,'category'),paid,(v->>'date')::date,date_at);category:='Expenses';description:=v->>'category';impact:=-paid;
 elsif path='/branches' then
  perform private.ss_assert(m.role='owner','Owner permission required');entity:=private.ss_text(v,'name');insert into public.smartsell_branches(id,business_id,name,address,phone) values(eid,m.business_id,entity,private.ss_text(v,'address',false),private.ss_text(v,'phone',false));description:='Branch created';
 elsif path='/staff' then
  perform private.ss_assert(m.role='owner','Owner permission required');perform private.ss_assert(v->>'role' in ('manager','cashier'),'Invalid role');perform private.ss_assert(position('@' in private.ss_text(v,'email'))>1,'Invalid email');perform private.ss_assert(not exists(select 1 from public.smartsell_members where lower(email)=lower(v->>'email')),'User already belongs to a Smartsell business');entity:=private.ss_text(v,'name');insert into public.smartsell_invitations values(eid,m.business_id,b,entity,lower(v->>'email'),v->>'role',now());description:='Staff access invitation created · email not sent';category:='Staff';
 elsif path like '/staff/%/toggle' then
  perform private.ss_assert(m.role='owner','Owner permission required');target:=split_part(path,'/',3)::uuid;select * into member from public.smartsell_members where id=target and business_id=m.business_id and role<>'owner';perform private.ss_assert(found,'Staff account not found');update public.smartsell_members set active=1-active where id=target;entity:=member.name;description:='Staff access changed';category:='Staff';
 elsif path='/profile' then
  perform private.ss_assert(v->>'theme' in ('dark','light'),'Invalid theme');update public.smartsell_members set name=private.ss_text(v,'name'),theme=v->>'theme' where id=m.id;entity:=m.name;description:='Profile updated';
 elsif path='/business' then
  perform private.ss_assert(m.role='owner','Owner permission required');perform private.ss_assert(exists(select 1 from pg_timezone_names where name=v->>'timezone'),'Invalid timezone');perform private.ss_assert(v->>'currency' ~ '^[A-Z]{3}$','Currency must be a three-letter ISO code');perform private.ss_assert(coalesce(v->>'category','Retail') in ('Retail','Grocery','Fashion','Electronics','Restaurant','Pharmacy','Beauty & Personal Care','Hardware','Other'),'Invalid business category');perform private.ss_assert(coalesce(v->>'category','Retail')<>'Other' or length(coalesce(v->>'custom_category',''))>0,'Enter your business category');entity:=private.ss_text(v,'name');update public.smartsell_businesses set name=entity,currency=v->>'currency',country=private.ss_text(v,'country'),timezone=v->>'timezone',email=private.ss_text(v,'email',false),phone=private.ss_text(v,'phone',false),address=private.ss_text(v,'address',false),tax_id=private.ss_text(v,'tax_id',false),category=coalesce(v->>'category','Retail'),custom_category=coalesce(v->>'custom_category','') where id=m.business_id;description:='Business profile updated';
 elsif path='/exports' then
  insert into public.smartsell_exports(id,business_id,branch_id,name,scope,content) values(eid,m.business_id,b,private.ss_text(v,'name'),private.ss_text(v,'scope'),v->>'content');entity:=v->>'name';description:='Device report exported';
 else raise exception 'Unsupported operation: %',path;
 end if;
 perform private.ss_event(m,b,category,entity,description,coalesce(ref,eid::text),impact);
 result:=jsonb_build_object('id',eid,'ok',true)||result;
 insert into public.smartsell_operations(id,business_id,actor_id,payload,response) values(oid,m.business_id,m.id,command,result);return result;
end $$;
create function private.smartsell_update_branch(command jsonb)
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

create function private.smartsell_restaurant(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
 m public.smartsell_members:=private.ss_member();
 action text:=command->>'action';
 v jsonb:=coalesce(command->'body','{}'::jsonb);
 branch_id uuid;
 operation_id uuid:=nullif(command->>'id','')::uuid;
 entity_id uuid:=nullif(command->>'entity_id','')::uuid;
 created_at timestamptz:=nullif(command->>'created_at','')::timestamptz;
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
 perform private.ss_assert(m.role in ('owner','manager'),'Your role does not permit this action');
 perform private.ss_assert(exists(select 1 from public.smartsell_businesses b where b.id=m.business_id and b.category='Restaurant'),'Restaurant tools are only available to Restaurant businesses');

 if action='list' then
  branch_id:=coalesce(nullif(command->>'branch_id','')::uuid,m.branch_id);
  perform private.ss_branch(m,branch_id);
  select coalesce(jsonb_agg(to_jsonb(t) order by t.name),'[]'::jsonb)
    into tables_data
    from public.smartsell_dining_tables t
   where t.business_id=m.business_id and t.branch_id=branch_id and t.active=1;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.name),'[]'::jsonb)
    into stations_data
    from public.smartsell_kitchen_stations s
   where s.business_id=m.business_id and s.branch_id=branch_id and s.active=1;
  select coalesce(jsonb_agg(q.data order by q.created_at desc),'[]'::jsonb)
    into orders_data
    from (
      select o.created_at,to_jsonb(o)||jsonb_build_object(
       'table_name',t.name,'actor',u.name,'items',coalesce((
        select jsonb_agg(to_jsonb(i)||jsonb_build_object('station_name',s.name) order by s.name,i.name)
          from public.smartsell_restaurant_order_items i
          left join public.smartsell_kitchen_stations s on s.id=i.station_id and s.business_id=i.business_id and s.branch_id=i.branch_id
         where i.order_id=o.id
       ),'[]'::jsonb)) as data
        from public.smartsell_restaurant_orders o
        join public.smartsell_dining_tables t on t.id=o.table_id and t.business_id=o.business_id and t.branch_id=o.branch_id
        join public.smartsell_members u on u.id=o.created_by
       where o.business_id=m.business_id and o.branch_id=branch_id
       order by o.created_at desc limit 200
    ) q;
  return jsonb_build_object('tables',tables_data,'stations',stations_data,'orders',orders_data);
 end if;

 perform private.ss_assert(action in ('create_table','create_station','create_order','submit_order','set_item_status','close_order','cancel_order'),'Unsupported restaurant operation');
 perform private.ss_assert(operation_id is not null and entity_id is not null,'Invalid restaurant operation');
 perform pg_advisory_xact_lock(hashtextextended(operation_id::text,1));
 select * into prior from public.smartsell_operations o where o.id=operation_id;
 if found then
  perform private.ss_assert(prior.business_id=m.business_id and prior.actor_id=m.id and prior.payload=command,'Operation key reused with a different request');
  return prior.response;
 end if;
 perform private.ss_assert(created_at between now()-interval '7 days' and now()+interval '5 minutes','Device operation is too old or its clock is incorrect');

 if action in ('create_table','create_station','create_order') then
  branch_id:=coalesce(nullif(v->>'branch_id','')::uuid,m.branch_id);
  perform private.ss_branch(m,branch_id);
 end if;

 if action='create_table' then
  table_name:=private.ss_text(v,'name');
  insert into public.smartsell_dining_tables(id,business_id,branch_id,name,seats)
  values(entity_id,m.business_id,branch_id,table_name,private.ss_int(v,'seats',1,100));
  result:=jsonb_build_object('id',entity_id);
  perform private.ss_event(m,branch_id,'Restaurant',table_name,'Dining table created',entity_id::text);
 elsif action='create_station' then
  table_name:=private.ss_text(v,'name');
  insert into public.smartsell_kitchen_stations(id,business_id,branch_id,name)
  values(entity_id,m.business_id,branch_id,table_name);
  result:=jsonb_build_object('id',entity_id);
  perform private.ss_event(m,branch_id,'Restaurant',table_name,'Kitchen station created',entity_id::text);
 elsif action='create_order' then
  table_id:=nullif(v->>'table_id','')::uuid;
  perform private.ss_assert(table_id is not null,'Dining table not found');
  select * into dining_table from public.smartsell_dining_tables t
   where t.id=table_id and t.business_id=m.business_id and t.branch_id=branch_id and t.active=1 for update;
  perform private.ss_assert(found,'Dining table not found');
  perform private.ss_assert(not exists(select 1 from public.smartsell_restaurant_orders o where o.table_id=dining_table.id and o.status in ('open','submitted','preparing','ready','served')),'This table already has an active order');
  if jsonb_typeof(v->'items')<>'array' then raise exception 'Add at least one product to the table order';end if;
  perform private.ss_assert(jsonb_array_length(v->'items') between 1 and 100,'Add between 1 and 100 products to the table order');
  reference:='RO-'||upper(substr(entity_id::text,1,8));
  insert into public.smartsell_restaurant_orders(id,business_id,branch_id,table_id,reference,status,notes,created_by,created_at,updated_at)
  values(entity_id,m.business_id,branch_id,table_id,reference,'open',private.ss_text(v,'notes',false),m.id,created_at,created_at);
  for line in select value from jsonb_array_elements(v->'items') loop
   perform private.ss_assert(nullif(line->>'variant_id','') is null,'Product variants are not supported for this menu item');
   product_id:=nullif(line->>'product_id','')::uuid;
   select * into product from public.smartsell_products p where p.id=product_id and p.business_id=m.business_id and p.active=1;
   perform private.ss_assert(found,'Product not found');
   perform private.ss_assert(coalesce(line->>'quantity','') ~ '^[0-9]+([.][0-9]{1,3})?$','Invalid restaurant quantity');
   item_quantity:=(line->>'quantity')::numeric;
   perform private.ss_assert(item_quantity between 0.001 and 100000,'Restaurant quantity is outside the supported range');
   station_id:=nullif(line->>'station_id','')::uuid;
   if station_id is not null then
    select * into station from public.smartsell_kitchen_stations s
     where s.id=station_id and s.business_id=m.business_id and s.branch_id=branch_id and s.active=1;
    perform private.ss_assert(found,'Kitchen station not found');
   end if;
   insert into public.smartsell_restaurant_order_items(business_id,branch_id,order_id,product_id,station_id,name,sku,quantity,price,cost)
   values(m.business_id,branch_id,entity_id,product_id,station_id,product.name,product.sku,item_quantity,product.price,product.cost);
  end loop;
  result:=jsonb_build_object('id',entity_id,'reference',reference);
  perform private.ss_event(m,branch_id,'Restaurant',dining_table.name,'Table order opened',reference);
 else
  select * into restaurant_order from public.smartsell_restaurant_orders o
   where o.id=entity_id and o.business_id=m.business_id for update;
  perform private.ss_assert(found,'Restaurant order not found');
  branch_id:=restaurant_order.branch_id;
  perform private.ss_branch(m,branch_id);
  if action='submit_order' then
   perform private.ss_assert(restaurant_order.status='open','This order is no longer open');
   for order_item in select i.* from public.smartsell_restaurant_order_items i where i.order_id=restaurant_order.id order by i.id loop
    perform private.ss_movement(m.business_id,branch_id,order_item.product_id,-order_item.quantity,'Restaurant order',restaurant_order.reference);
   end loop;
   update public.smartsell_restaurant_orders set status='submitted',updated_at=now() where id=restaurant_order.id;
   result:=jsonb_build_object('ok',true);
   perform private.ss_event(m,branch_id,'Restaurant',restaurant_order.reference,'Order sent to kitchen; stock deducted',restaurant_order.reference);
  elsif action='set_item_status' then
   perform private.ss_assert(restaurant_order.status in ('submitted','preparing','ready'),'Send the order to the kitchen before updating its items');
   item_id:=nullif(command->>'item_id','')::uuid;
   select * into order_item from public.smartsell_restaurant_order_items i where i.id=item_id and i.order_id=restaurant_order.id for update;
   perform private.ss_assert(found,'Order item not found');
   next_status:=case order_item.status when 'queued' then 'preparing' when 'preparing' then 'ready' when 'ready' then 'served' else null end;
   perform private.ss_assert(next_status is not null and next_status=command->>'status','Order item status must advance one step at a time');
   update public.smartsell_restaurant_order_items set status=next_status where id=order_item.id;
   select bool_and(i.status in ('ready','served')),bool_and(i.status='served')
    into all_ready,all_served from public.smartsell_restaurant_order_items i where i.order_id=restaurant_order.id;
   update public.smartsell_restaurant_orders set status=case when all_served then 'served' when all_ready then 'ready' else 'preparing' end,updated_at=now()
    where id=restaurant_order.id;
   result:=jsonb_build_object('ok',true);
   perform private.ss_event(m,branch_id,'Restaurant',order_item.name,'Kitchen item marked '||next_status,restaurant_order.reference);
  elsif action='close_order' then
   perform private.ss_assert(restaurant_order.status='served','All order items must be served before closing');
   update public.smartsell_restaurant_orders set status='closed',updated_at=now() where id=restaurant_order.id;
   result:=jsonb_build_object('ok',true);
   perform private.ss_event(m,branch_id,'Restaurant',restaurant_order.reference,'Table order closed; payment is recorded separately in POS',restaurant_order.reference);
  else
   perform private.ss_assert(action='cancel_order' and restaurant_order.status='open','Only an unsent order can be cancelled');
   update public.smartsell_restaurant_order_items set status='cancelled' where order_id=restaurant_order.id;
   update public.smartsell_restaurant_orders set status='cancelled',updated_at=now() where id=restaurant_order.id;
   result:=jsonb_build_object('ok',true);
   perform private.ss_event(m,branch_id,'Restaurant',restaurant_order.reference,'Unsent table order cancelled',restaurant_order.reference);
  end if;
 end if;

 insert into public.smartsell_operations(id,business_id,actor_id,payload,response)
 values(operation_id,m.business_id,m.id,command,result);
 return result;
end
$$;
create function public.smartsell_restaurant(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.smartsell_restaurant(command); $$;

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
-- Default PUBLIC execution is revoked, including helpers. Only the four guarded RPCs are reachable.
do $$ declare f record;begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and (p.proname like 'smartsell_%' or p.proname like 'ss_%') loop execute format('revoke all on function %I.%I(%s) from public,anon,authenticated',f.nspname,f.proname,f.args);end loop;
end $$;
grant usage on schema private to authenticated;
grant execute on function private.smartsell_identity(),private.smartsell_onboard(jsonb),private.smartsell_workspace(uuid),private.smartsell_command(jsonb),private.smartsell_update_branch(jsonb),private.smartsell_restaurant(jsonb) to authenticated;
grant execute on function public.smartsell_identity(),public.smartsell_onboard(jsonb),public.smartsell_workspace(uuid),public.smartsell_command(jsonb),public.smartsell_restaurant(jsonb) to authenticated;
