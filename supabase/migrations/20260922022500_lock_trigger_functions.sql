-- Security hardening: trigger-only SECURITY DEFINER functions must not be callable as RPCs.
-- Trigger execution is unaffected by revoking direct EXECUTE privileges.

revoke all on function public.enforce_courier_moderation_state()
from public, anon, authenticated;

revoke all on function public.enforce_store_moderation_state()
from public, anon, authenticated;

revoke all on function public.record_platform_delivery_commission()
from public, anon, authenticated;

revoke all on function public.refresh_courier_delivery_batch_after_delete()
from public, anon, authenticated;
