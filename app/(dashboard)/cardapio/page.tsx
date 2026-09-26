import Link from 'next/link'
import { requireStore } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Icon } from '@/components/icon'

export default async function MenuPage() {
  const { store } = await requireStore()
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('store_integrations')
    .select('provider,status,is_enabled,last_synced_at')
    .eq('store_id',store.id)
    .order('provider')

  const integrations = rows ?? []
  const enabled = integrations.filter(item => item.is_enabled && item.status === 'connected')

  return (
    <div className="catalog-page">
      <section className="hero catalog-hero">
        <div>
          <div className="eyebrow">CARDÁPIO</div>
          <h1>Cardápio conectado</h1>
          <p className="subtle">
            Centralize os itens dos seus pedidos e acompanhe quais integrações já enviam produtos para o ChamaEntrega.
          </p>
        </div>
        <Link href="/integracoes" className="button button-gold">
          <Icon name="link" size={17}/> GERENCIAR INTEGRAÇÕES
        </Link>
      </section>

      <section className="grid-metrics catalog-metrics">
        <article className="metric gold">
          <div className="metric-label">Integrações conectadas</div>
          <div className="metric-value">{enabled.length}</div>
          <div className="metric-note">Fontes ativas de pedidos e produtos</div>
        </article>
        <article className="metric">
          <div className="metric-label">Pedidos recebidos</div>
          <div className="metric-value">—</div>
          <div className="metric-note">Os produtos aparecerão conforme as integrações enviarem itens</div>
        </article>
        <article className="metric">
          <div className="metric-label">Produtos sincronizados</div>
          <div className="metric-value">—</div>
          <div className="metric-note">Catálogo em preparação para sincronização automática</div>
        </article>
        <article className="metric green">
          <div className="metric-label">Status</div>
          <div className="metric-value">{enabled.length ? 'Ativo' : 'Configurar'}</div>
          <div className="metric-note">
            {enabled.length ? 'Há integração pronta para receber dados.' : 'Conecte Goomer, Brendi ou outra fonte.'}
          </div>
        </article>
      </section>

      <section className="card catalog-main-card">
        <div className="card-head">
          <div>
            <h2>Fontes do cardápio</h2>
            <p className="subtle">Integrações cadastradas para {store.name}.</p>
          </div>
          <Link href="/pedidos" className="button button-dark">VER PEDIDOS</Link>
        </div>

        {integrations.length ? (
          <div className="card-body quick catalog-integration-list">
            {integrations.map(item => (
              <Link href="/integracoes" key={item.provider}>
                <strong>{String(item.provider).toUpperCase()}</strong>
                <span>
                  {item.is_enabled && item.status === 'connected'
                    ? 'Conectado e habilitado'
                    : item.status === 'error'
                      ? 'Requer atenção'
                      : 'Ainda não conectado'}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">
            Nenhuma integração de cardápio configurada ainda.
          </div>
        )}
      </section>
    </div>
  )
}
