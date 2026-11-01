-- Allow larger inline document logos and persist the current block-editor configuration.
do $$
declare
  size_constraint text;
begin
  select conname
    into size_constraint
    from pg_constraint
   where conrelid = 'public.smartsell_document_templates'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%octet_length(config::text)%';

  if size_constraint is not null then
    execute format(
      'alter table public.smartsell_document_templates drop constraint %I',
      size_constraint
    );
  end if;
end
$$;

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
  perform private.ss_assert(
    doc_type in ('sales_receipt', 'sales_invoice'),
    'Unsupported document type'
  );

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
    perform private.ss_assert(length(template_name) between 1 and 100, 'Template name must be 1-100 characters');
    perform private.ss_assert(jsonb_typeof(template_config) = 'object', 'Invalid template configuration');
    perform private.ss_assert(
      template_config - array['primary_color','accent_color','font_family','paper_size','header_layout','footer_message','logo_data_url','editor_data'] = '{}'::jsonb,
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
      'Unsupported document paper size'
    );
    perform private.ss_assert(
      coalesce(template_config->>'header_layout', 'centered') in ('centered','split'),
      'Unsupported document header layout'
    );
    perform private.ss_assert(length(coalesce(template_config->>'footer_message', '')) <= 300, 'Footer message is too long');
    perform private.ss_assert(
      template_config->>'logo_data_url' is null
      or template_config->>'logo_data_url' ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$',
      'Logo must be a PNG, JPEG, or WebP data URL'
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
