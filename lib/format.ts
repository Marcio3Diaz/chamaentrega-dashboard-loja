export function currency(value: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0)
}

export function shortId(id: string) {
  return id.replaceAll('-', '').slice(0, 7).toUpperCase()
}

export function dateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

export const activeStatuses = ['accepted', 'heading_to_pickup', 'at_pickup', 'heading_to_dropoff', 'at_dropoff']

export const statusLabel: Record<string, string> = {
  draft: 'Rascunho',
  available: 'Buscando entregador',
  negotiating: 'Em negociação',
  accepted: 'Aceita',
  heading_to_pickup: 'Indo retirar',
  at_pickup: 'Na retirada',
  heading_to_dropoff: 'A caminho do cliente',
  at_dropoff: 'No destino',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  expired: 'Expirada',
}
