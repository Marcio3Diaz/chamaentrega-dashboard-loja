-- Endurece RPCs sensíveis do fluxo operacional de entrega.
-- Todas as relações e chamadas de RPC usadas pelas funções já são
-- qualificadas por schema; pg_catalog continua disponível para built-ins.

alter function public.advance_delivery_status_with_location(
  uuid,
  text,
  double precision,
  double precision,
  double precision,
  text
)
set search_path = '';

alter function public.complete_delivery_flow_v2(
  uuid,
  text
)
set search_path = '';
