-- Additive Smartsell receipt-template migration. No unrelated project objects are modified.
do $$
begin
  if to_regclass('public.smartsell_businesses') is null
    or to_regclass('public.smartsell_members') is null
    or to_regprocedure('private.ss_member()') is null
    or to_regprocedure('private.ss_assert(boolean,text)') is null then
    raise exception 'Deploy the Smartsell core schema before applying the document-template migration';
  end if;
end
$$;
-- Templates are private to the authenticated member's Smartsell business.
create table if not exists public.smartsell_document_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.smartsell_businesses(id) on delete cascade,
  document_type text not null check (document_type in ('sales_receipt')),
  name text not null check (length(name) between 1 and 100),
  config jsonb not null default '{}'::jsonb
    check (octet_length(config::text) <= 200000),
  is_default boolean not null default false,
  is_published boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists smartsell_document_templates_business_type_idx
  on public.smartsell_document_templates (business_id, document_type, updated_at desc);
create unique index if not exists smartsell_document_templates_one_default_idx
  on public.smartsell_document_templates (business_id, document_type)
  where is_default;

alter table public.smartsell_document_templates enable row level security;
revoke all on public.smartsell_document_templates from anon, authenticated;

create or replace function private.smartsell_document_templates(command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  m public.smartsell_members := private.ss_member();
  action text := command->>'action';
  template_id uuid := nullif(command->>'id', '')::uuid;
  doc_type text := coalesce(command->>'document_type', 'sales_receipt');
  template_name text;
  template_config jsonb;
  saved public.smartsell_document_templates;
begin
  perform private.ss_assert(doc_type = 'sales_receipt', 'Unsupported document type');

  if action = 'list' then
    return jsonb_build_object(
      'templates',
      coalesce(
        (select jsonb_agg(to_jsonb(t) order by t.is_default desc, t.updated_at desc)
         from public.smartsell_document_templates t
         where t.business_id = m.business_id and t.document_type = doc_type),
        '[]'::jsonb
      )
    );
  end if;

  perform private.ss_assert(m.role = 'owner', 'Owner permission required to manage document templates');
  perform pg_advisory_xact_lock(hashtextextended(m.business_id::text || ':document-templates', 0));

  if action = 'save' then
    template_name := trim(coalesce(command->>'name', ''));
    template_config := command->'config';
    perform private.ss_assert(length(template_name) between 1 and 100, 'Template name must be 1–100 characters');
    perform private.ss_assert(jsonb_typeof(template_config) = 'object', 'Invalid template configuration');
    perform private.ss_assert(
      template_config - array['primary_color','accent_color','font_family','paper_size','header_layout','footer_message','logo_data_url'] = '{}'::jsonb,
      'Template configuration contains unsupported fields'
    );
    perform private.ss_assert(
      coalesce(template_config->>'primary_color', '#12345A') ~ '^#[0-9A-Fa-f]{6}$'
      and coalesce(template_config->>'accent_color', '#D6A94B') ~ '^#[0-9A-Fa-f]{6}$',
      'Invalid template color'
    );
    perform private.ss_assert(
      coalesce(template_config->>'font_family', 'Segoe UI') in ('Segoe UI','Arial','Georgia','Tahoma'),
      'Unsupported document font'
    );
    perform private.ss_assert(
      coalesce(template_config->>'paper_size', '80mm') in ('58mm','80mm','A4'),
      'Unsupported receipt paper size'
    );
    perform private.ss_assert(
      coalesce(template_config->>'header_layout', 'centered') in ('centered','split'),
      'Unsupported receipt header layout'
    );
    perform private.ss_assert(length(coalesce(template_config->>'footer_message', '')) <= 300, 'Footer message is too long');
    perform private.ss_assert(
      coalesce(length(template_config->>'logo_data_url'), 0) <= 180000
      and (template_config->>'logo_data_url' is null
        or template_config->>'logo_data_url' ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'),
      'Logo must be a PNG, JPEG, or WebP under 128 KB'
    );

    if template_id is null then
      insert into public.smartsell_document_templates
        (business_id, document_type, name, config, is_published, created_by)
      values
        (m.business_id, doc_type, template_name, template_config,
         coalesce((command->>'is_published')::boolean, false), m.id)
      returning * into saved;
    else
      update public.smartsell_document_templates t
      set name = template_name,
          config = template_config,
          is_published = coalesce((command->>'is_published')::boolean, t.is_published),
          updated_at = now()
      where t.id = template_id
        and t.business_id = m.business_id
        and t.document_type = doc_type
      returning * into saved;
      perform private.ss_assert(saved.id is not null, 'Template not found in this business');
    end if;
    return to_jsonb(saved);
  elsif action = 'set_default' then
    perform private.ss_assert(template_id is not null, 'Template ID is required');
    update public.smartsell_document_templates t
    set is_default = false, updated_at = now()
    where t.business_id = m.business_id and t.document_type = doc_type and t.is_default;
    update public.smartsell_document_templates t
    set is_default = true, is_published = true, updated_at = now()
    where t.id = template_id and t.business_id = m.business_id and t.document_type = doc_type
    returning * into saved;
    perform private.ss_assert(saved.id is not null, 'Template not found in this business');
    return to_jsonb(saved);
  end if;

  raise exception 'Unsupported document template action: %', action;
end
$$;

create or replace function public.smartsell_document_templates(command jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.smartsell_document_templates(command); $$;

revoke all on function private.smartsell_document_templates(jsonb) from public, anon, authenticated;
revoke all on function public.smartsell_document_templates(jsonb) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.smartsell_document_templates(jsonb) to authenticated;
grant execute on function public.smartsell_document_templates(jsonb) to authenticated;
