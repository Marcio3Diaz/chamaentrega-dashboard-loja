import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { StoreDeliveryChat, type StoreChatConversation } from '@/components/store-delivery-chat'

type ChatPageProps = {
  searchParams?: Promise<{ delivery?: string }>
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const { store, userId } = await requireStore()
  const supabase = await createClient()
  const query = searchParams ? await searchParams : {}
  const requestedDeliveryId = query.delivery?.trim() || null

  const { data: deliveryRows } = await supabase
    .from('deliveries')
    .select('id,assigned_courier_id,status,customer_name,delivery_address,delivery_fee,created_at,updated_at')
    .eq('store_id', store.id)
    .not('assigned_courier_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(100)

  const courierIds = Array.from(
    new Set((deliveryRows ?? []).map(item => item.assigned_courier_id).filter(Boolean) as string[]),
  )

  const { data: profileRows } = courierIds.length
    ? await supabase
        .from('profiles')
        .select('id,full_name,avatar_url')
        .in('id', courierIds)
    : { data: [] as { id: string; full_name: string | null; avatar_url: string | null }[] }

  const profiles = new Map((profileRows ?? []).map(profile => [profile.id, profile]))

  const conversations: StoreChatConversation[] = (deliveryRows ?? []).map(delivery => {
    const courierId = delivery.assigned_courier_id as string
    const profile = profiles.get(courierId)

    return {
      deliveryId: delivery.id,
      courierId,
      courierName: profile?.full_name?.trim() || 'Entregador parceiro',
      courierAvatarUrl: profile?.avatar_url ?? null,
      customerName: delivery.customer_name?.trim() || 'Cliente',
      deliveryAddress: delivery.delivery_address,
      deliveryFee: Number(delivery.delivery_fee ?? 0),
      status: delivery.status,
      createdAt: delivery.created_at,
      updatedAt: delivery.updated_at,
    }
  })

  return (
    <StoreDeliveryChat
      storeId={store.id}
      storeName={store.name}
      currentUserId={userId}
      initialConversations={conversations}
      initialDeliveryId={requestedDeliveryId}
    />
  )
}
