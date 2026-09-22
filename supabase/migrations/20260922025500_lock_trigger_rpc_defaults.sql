-- Prevent trigger functions from being callable as RPCs and make future
-- database functions private-by-default until explicitly granted.

revoke all on function public.set_courier_support_ticket_timestamps()
from public, anon, authenticated;

revoke all on function public.set_courier_verification_updated_at()
from public, anon, authenticated;

revoke all on function public.set_store_integrations_updated_at()
from public, anon, authenticated;

revoke all on function public.set_store_orders_updated_at()
from public, anon, authenticated;

revoke all on function public.set_updated_at()
from public, anon, authenticated;

revoke all on function public.set_whatsapp_conversation_updated_at()
from public, anon, authenticated;

revoke all on function public.set_whatsapp_credentials_updated_at()
from public, anon, authenticated;

revoke all on function public.update_store_wallet_updated_at()
from public, anon, authenticated;

alter default privileges in schema public
revoke execute on functions from public;
