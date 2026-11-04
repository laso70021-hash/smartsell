create index smartsell_platform_business_reviews_reviewer_idx
  on private.smartsell_platform_business_reviews (reviewed_by)
  where reviewed_by is not null;

create index smartsell_platform_settings_updated_by_idx
  on private.smartsell_platform_settings (updated_by);

create index smartsell_platform_support_messages_actor_idx
  on private.smartsell_platform_support_messages (actor_id);

create index smartsell_platform_support_tickets_assignee_idx
  on private.smartsell_platform_support_tickets (assigned_admin)
  where assigned_admin is not null;

create index smartsell_platform_support_tickets_creator_idx
  on private.smartsell_platform_support_tickets (created_by);