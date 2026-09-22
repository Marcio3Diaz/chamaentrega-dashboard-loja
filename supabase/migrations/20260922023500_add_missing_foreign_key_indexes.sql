-- Performance hardening: indexes for foreign keys reported by the Supabase advisor.

create index if not exists admin_moderation_events_admin_id_idx
  on public.admin_moderation_events(admin_id);

create index if not exists couriers_moderated_by_idx
  on public.couriers(moderated_by);

create index if not exists platform_billing_settings_updated_by_idx
  on public.platform_billing_settings(updated_by);

create index if not exists platform_revenue_events_subscription_id_idx
  on public.platform_revenue_events(subscription_id);

create index if not exists stores_moderated_by_idx
  on public.stores(moderated_by);
