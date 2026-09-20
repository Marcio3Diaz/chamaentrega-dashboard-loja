'use client'

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/icon'

export type StoreChatConversation = {
  deliveryId: string
  courierId: string
  courierName: string
  courierAvatarUrl: string | null
  customerName: string
  deliveryAddress: string
  deliveryFee: number
  status: string
  createdAt: string
  updatedAt: string
}

type ChatMessage = {
  id: string
  delivery_id: string
  sender_id: string
  sender_role: 'courier' | 'store' | 'admin'
  body: string
  created_at: string
  read_at: string | null
}

type Props = {
  storeId: string
  storeName: string
  currentUserId: string
  initialConversations: StoreChatConversation[]
  initialDeliveryId: string | null
}

const activeStatuses = new Set([
  'accepted',
  'heading_to_pickup',
  'at_pickup',
  'heading_to_dropoff',
  'at_dropoff',
])

const statusLabels: Record<string,string> = {
  accepted: 'Aceita',
  heading_to_pickup: 'Indo retirar',
  at_pickup: 'Na loja',
  heading_to_dropoff: 'A caminho do cliente',
  at_dropoff: 'No cliente',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  expired: 'Expirada',
}

function shortId(value: string) {
  return value.replaceAll('-', '').slice(0, 7).toUpperCase()
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function dateLabel(value: string) {
  const date = new Date(value)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) return 'Hoje'

  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) return 'Ontem'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(date)
}

function fullDateDivider(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date(value))
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function isSameDay(first: string, second: string) {
  const a = new Date(first)
  const b = new Date(second)
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function StoreDeliveryChat({
  storeId,
  storeName,
  currentUserId,
  initialConversations,
  initialDeliveryId,
}: Props) {
  const supabase = useMemo(() => createClient(), [])
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const initialSelected =
    initialConversations.some(item => item.deliveryId === initialDeliveryId)
      ? initialDeliveryId
      : initialConversations.find(item => activeStatuses.has(item.status))?.deliveryId ??
        initialConversations[0]?.deliveryId ??
        null

  const [conversations, setConversations] = useState(initialConversations)
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(initialSelected)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [lastMessages, setLastMessages] = useState<Record<string,ChatMessage>>({})
  const [unreadCounts, setUnreadCounts] = useState<Record<string,number>>({})
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const [realtimeState, setRealtimeState] = useState('CONECTANDO')

  const selectedConversation = conversations.find(item => item.deliveryId === selectedDeliveryId) ?? null

  const sortedConversations = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('pt-BR')

    return [...conversations]
      .filter(item => {
        if (!normalized) return true
        return [
          item.courierName,
          item.customerName,
          item.deliveryAddress,
          shortId(item.deliveryId),
        ].some(value => value.toLocaleLowerCase('pt-BR').includes(normalized))
      })
      .sort((a,b) => {
        const aMessage = lastMessages[a.deliveryId]?.created_at ?? a.updatedAt
        const bMessage = lastMessages[b.deliveryId]?.created_at ?? b.updatedAt
        return new Date(bMessage).getTime() - new Date(aMessage).getTime()
      })
  }, [conversations, lastMessages, search])

  const totalUnread = Object.values(unreadCounts).reduce((sum,value) => sum + value, 0)

  const scrollToBottom = useCallback((smooth = true) => {
    window.setTimeout(() => {
      const element = scrollRef.current
      if (!element) return
      element.scrollTo({
        top: element.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      })
    }, 20)
  }, [])

  const markRead = useCallback(async (deliveryId: string) => {
    try {
      await supabase.rpc('mark_delivery_chat_messages_read', {
        p_delivery_id: deliveryId,
      })

      setUnreadCounts(current => ({
        ...current,
        [deliveryId]: 0,
      }))

      setMessages(current => current.map(message =>
        message.delivery_id === deliveryId &&
        message.sender_id !== currentUserId &&
        !message.read_at
          ? { ...message, read_at: new Date().toISOString() }
          : message
      ))
    } catch {
      // A leitura será tentada novamente quando a conversa for atualizada.
    }
  }, [currentUserId, supabase])

  const loadConversation = useCallback(async (deliveryId: string) => {
    setIsLoadingMessages(true)
    setError('')

    const { data, error: fetchError } = await supabase
      .from('delivery_chat_messages')
      .select('id,delivery_id,sender_id,sender_role,body,created_at,read_at')
      .eq('delivery_id', deliveryId)
      .order('created_at', { ascending: true })

    if (fetchError) {
      setError('Não foi possível carregar esta conversa.')
      setMessages([])
      setIsLoadingMessages(false)
      return
    }

    setMessages((data ?? []) as ChatMessage[])
    setIsLoadingMessages(false)
    void markRead(deliveryId)
    scrollToBottom(false)
  }, [markRead, scrollToBottom, supabase])

  const loadSummaries = useCallback(async () => {
    const deliveryIds = conversations.map(item => item.deliveryId)
    if (!deliveryIds.length) {
      setLastMessages({})
      setUnreadCounts({})
      return
    }

    const { data } = await supabase
      .from('delivery_chat_messages')
      .select('id,delivery_id,sender_id,sender_role,body,created_at,read_at')
      .in('delivery_id', deliveryIds)
      .order('created_at', { ascending: false })
      .limit(1000)

    const rows = (data ?? []) as ChatMessage[]
    const nextLast: Record<string,ChatMessage> = {}
    const nextUnread: Record<string,number> = {}

    for (const message of rows) {
      if (!nextLast[message.delivery_id]) nextLast[message.delivery_id] = message
      if (message.sender_id !== currentUserId && !message.read_at) {
        nextUnread[message.delivery_id] = (nextUnread[message.delivery_id] ?? 0) + 1
      }
    }

    setLastMessages(nextLast)
    setUnreadCounts(nextUnread)
  }, [conversations, currentUserId, supabase])

  const refreshConversations = useCallback(async () => {
    const { data: deliveryRows } = await supabase
      .from('deliveries')
      .select('id,assigned_courier_id,status,customer_name,delivery_address,delivery_fee,created_at,updated_at')
      .eq('store_id', storeId)
      .not('assigned_courier_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(100)

    const rows = deliveryRows ?? []
    const courierIds = Array.from(
      new Set(rows.map(item => item.assigned_courier_id).filter(Boolean) as string[]),
    )

    const { data: profileRows } = courierIds.length
      ? await supabase
          .from('profiles')
          .select('id,full_name,avatar_url')
          .in('id', courierIds)
      : { data: [] as any[] }

    const profileMap = new Map((profileRows ?? []).map(item => [item.id,item]))

    const next = rows.map((delivery: any): StoreChatConversation => {
      const courierId = String(delivery.assigned_courier_id)
      const profile = profileMap.get(courierId)
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

    setConversations(next)

    if (!selectedDeliveryId && next.length) {
      setSelectedDeliveryId(
        next.find(item => activeStatuses.has(item.status))?.deliveryId ?? next[0].deliveryId,
      )
    }
  }, [selectedDeliveryId, storeId, supabase])

  useEffect(() => {
    void loadSummaries()
  }, [loadSummaries])

  useEffect(() => {
    if (!selectedDeliveryId) {
      setMessages([])
      return
    }

    void loadConversation(selectedDeliveryId)
  }, [loadConversation, selectedDeliveryId])

  useEffect(() => {
    const chatChannel = supabase
      .channel(`store-chat:${storeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'delivery_chat_messages',
        },
        payload => {
          const message = payload.new as ChatMessage
          const isKnown = conversations.some(item => item.deliveryId === message.delivery_id)
          if (!isKnown) return

          setLastMessages(current => ({
            ...current,
            [message.delivery_id]: message,
          }))

          if (message.delivery_id === selectedDeliveryId) {
            setMessages(current => {
              if (current.some(item => item.id === message.id)) return current
              return [...current,message]
            })
            scrollToBottom()

            if (message.sender_id !== currentUserId) {
              void markRead(message.delivery_id)
            }
          } else if (message.sender_id !== currentUserId) {
            setUnreadCounts(current => ({
              ...current,
              [message.delivery_id]: (current[message.delivery_id] ?? 0) + 1,
            }))
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'delivery_chat_messages',
        },
        payload => {
          const message = payload.new as ChatMessage
          setMessages(current => current.map(item => item.id === message.id ? message : item))
          setLastMessages(current =>
            current[message.delivery_id]?.id === message.id
              ? { ...current, [message.delivery_id]: message }
              : current
          )
        },
      )
      .subscribe(status => {
        if (status === 'SUBSCRIBED') setRealtimeState('AO VIVO')
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeState('RECONECTANDO')
      })

    const deliveryChannel = supabase
      .channel(`store-chat-deliveries:${storeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deliveries',
          filter: `store_id=eq.${storeId}`,
        },
        () => void refreshConversations(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(chatChannel)
      void supabase.removeChannel(deliveryChannel)
    }
  }, [
    conversations,
    currentUserId,
    markRead,
    refreshConversations,
    scrollToBottom,
    selectedDeliveryId,
    storeId,
    supabase,
  ])

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault()

    const body = draft.trim()
    if (!body || !selectedDeliveryId || isSending) return

    setIsSending(true)
    setError('')

    const { error: sendError } = await supabase.rpc('send_delivery_chat_message', {
      p_delivery_id: selectedDeliveryId,
      p_body: body,
    })

    setIsSending(false)

    if (sendError) {
      const normalized = sendError.message.toLocaleLowerCase('pt-BR')
      if (normalized.includes('chat_sem_entregador')) {
        setError('O chat só é liberado depois que um entregador aceita a entrega.')
      } else if (normalized.includes('acesso_negado')) {
        setError('Você não possui acesso a esta conversa.')
      } else {
        setError('Não foi possível enviar a mensagem agora.')
      }
      return
    }

    setDraft('')
    inputRef.current?.focus()
    scrollToBottom()
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  function selectConversation(deliveryId: string) {
    setSelectedDeliveryId(deliveryId)
    setUnreadCounts(current => ({ ...current, [deliveryId]: 0 }))
    const url = new URL(window.location.href)
    url.searchParams.set('delivery', deliveryId)
    window.history.replaceState({}, '', url)
  }

  return (
    <div className="store-chat-page">
      <section className="store-chat-page-head">
        <div>
          <div className="eyebrow">COMUNICAÇÃO DA OPERAÇÃO</div>
          <h1>Chat com entregadores</h1>
          <p>Converse em tempo real com o entregador de cada pedido.</p>
        </div>

        <div className="store-chat-live">
          <span className={realtimeState === 'AO VIVO' ? 'online' : ''}><i />{realtimeState}</span>
          {totalUnread > 0 ? <b>{totalUnread} não lida{totalUnread === 1 ? '' : 's'}</b> : null}
        </div>
      </section>

      <section className="store-chat-shell">
        <aside className="store-chat-conversations">
          <div className="store-chat-conversations-head">
            <div>
              <strong>Conversas</strong>
              <span>{conversations.length} entrega{conversations.length === 1 ? '' : 's'} com entregador</span>
            </div>
          </div>

          <label className="store-chat-search">
            <span>⌕</span>
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar entregador, cliente ou pedido"
            />
          </label>

          <div className="store-chat-conversation-list">
            {sortedConversations.length ? sortedConversations.map(conversation => {
              const lastMessage = lastMessages[conversation.deliveryId]
              const unread = unreadCounts[conversation.deliveryId] ?? 0
              const selected = conversation.deliveryId === selectedDeliveryId
              const active = activeStatuses.has(conversation.status)

              return (
                <button
                  type="button"
                  key={conversation.deliveryId}
                  className={`store-chat-conversation ${selected ? 'selected' : ''}`}
                  onClick={() => selectConversation(conversation.deliveryId)}
                >
                  <span className="store-chat-avatar">
                    {conversation.courierAvatarUrl
                      ? <img src={conversation.courierAvatarUrl} alt="" />
                      : <span>{conversation.courierName.slice(0,1).toUpperCase()}</span>}
                    <i className={active ? 'active' : ''} />
                  </span>

                  <span className="store-chat-conversation-copy">
                    <span className="store-chat-conversation-line">
                      <strong>{conversation.courierName}</strong>
                      <small>{dateLabel(lastMessage?.created_at ?? conversation.updatedAt)}</small>
                    </span>
                    <span className="store-chat-order">#{shortId(conversation.deliveryId)} · {conversation.customerName}</span>
                    <span className="store-chat-preview">
                      {lastMessage
                        ? `${lastMessage.sender_id === currentUserId ? 'Você: ' : ''}${lastMessage.body}`
                        : 'Inicie a conversa com o entregador.'}
                    </span>
                  </span>

                  {unread > 0 ? <b className="store-chat-unread">{unread > 99 ? '99+' : unread}</b> : null}
                </button>
              )
            }) : (
              <div className="store-chat-no-conversations">
                <Icon name="chat" size={28}/>
                <strong>Nenhuma conversa encontrada</strong>
                <span>O chat aparece depois que uma entrega é aceita.</span>
              </div>
            )}
          </div>
        </aside>

        <main className="store-chat-panel">
          {selectedConversation ? (
            <>
              <header className="store-chat-panel-head">
                <div className="store-chat-panel-person">
                  <span className="store-chat-avatar large">
                    {selectedConversation.courierAvatarUrl
                      ? <img src={selectedConversation.courierAvatarUrl} alt="" />
                      : <span>{selectedConversation.courierName.slice(0,1).toUpperCase()}</span>}
                    <i className={activeStatuses.has(selectedConversation.status) ? 'active' : ''} />
                  </span>
                  <span>
                    <strong>{selectedConversation.courierName}</strong>
                    <small>
                      Entrega #{shortId(selectedConversation.deliveryId)} · {statusLabels[selectedConversation.status] ?? selectedConversation.status}
                    </small>
                  </span>
                </div>

                <div className="store-chat-panel-order">
                  <span>{selectedConversation.customerName}</span>
                  <strong>{money(selectedConversation.deliveryFee)}</strong>
                </div>
              </header>

              <div ref={scrollRef} className="store-chat-messages">
                {isLoadingMessages ? (
                  <div className="store-chat-state">Carregando conversa...</div>
                ) : messages.length ? (
                  messages.map((message,index) => {
                    const mine = message.sender_id === currentUserId
                    const showDate = index === 0 || !isSameDay(messages[index - 1].created_at, message.created_at)

                    return (
                      <div key={message.id}>
                        {showDate ? <div className="store-chat-date-divider"><span>{fullDateDivider(message.created_at)}</span></div> : null}

                        <div className={`store-chat-message-row ${mine ? 'mine' : 'theirs'}`}>
                          {!mine ? (
                            <span className="store-chat-message-avatar">
                              {selectedConversation.courierAvatarUrl
                                ? <img src={selectedConversation.courierAvatarUrl} alt="" />
                                : selectedConversation.courierName.slice(0,1).toUpperCase()}
                            </span>
                          ) : null}

                          <div className="store-chat-bubble">
                            <p>{message.body}</p>
                            <span>
                              {timeLabel(message.created_at)}
                              {mine ? <b>{message.read_at ? '✓✓ Lida' : '✓ Enviada'}</b> : null}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="store-chat-empty">
                    <span className="store-chat-empty-icon">✦</span>
                    <strong>Conversa iniciada</strong>
                    <p>
                      Envie uma mensagem para {selectedConversation.courierName}. Esta conversa fica vinculada à entrega #{shortId(selectedConversation.deliveryId)}.
                    </p>
                  </div>
                )}
              </div>

              <div className="store-chat-context">
                <span><Icon name="pin" size={14}/>{selectedConversation.deliveryAddress}</span>
                <span><Icon name="box" size={14}/>#{shortId(selectedConversation.deliveryId)}</span>
              </div>

              <form className="store-chat-composer" onSubmit={sendMessage}>
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={event => setDraft(event.target.value.slice(0,1000))}
                  onKeyDown={onComposerKeyDown}
                  placeholder="Digite uma mensagem para o entregador..."
                  rows={1}
                  disabled={isSending}
                />
                <span className="store-chat-counter">{draft.length}/1000</span>
                <button type="submit" disabled={!draft.trim() || isSending} aria-label="Enviar mensagem">
                  {isSending ? <span className="store-chat-sending" /> : <Icon name="arrow" size={20}/>}
                </button>
              </form>

              {error ? <div className="store-chat-error">{error}</div> : null}
            </>
          ) : (
            <div className="store-chat-select-state">
              <Icon name="chat" size={34}/>
              <strong>Selecione uma conversa</strong>
              <span>Escolha uma entrega com entregador atribuído para abrir o chat.</span>
            </div>
          )}
        </main>
      </section>

      <p className="store-chat-footnote">
        O chat é restrito à loja e ao entregador atribuído à entrega. {storeName} só vê conversas dos próprios pedidos.
      </p>
    </div>
  )
}
