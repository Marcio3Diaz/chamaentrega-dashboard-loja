import { createClient } from '@/lib/supabase/server'

function date(value:string) {
  return new Intl.DateTimeFormat('pt-BR',{
    day:'2-digit',
    month:'2-digit',
    year:'numeric',
  }).format(new Date(value))
}

const roleLabel:Record<string,string> = {
  admin:'Administrador',
  store_owner:'Responsável de loja',
  courier:'Entregador',
}

export default async function AdminUsersPage() {
  const supabase = await createClient()

  const [
    profilesResult,
    storesResult,
    storeMembersResult,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,role,full_name,phone,avatar_url,created_at')
      .order('created_at',{ascending:false})
      .limit(300),
    supabase
      .from('stores')
      .select('id,name,owner_id'),
    supabase
      .from('store_members')
      .select('store_id,user_id,role,status'),
  ])

  const profiles = profilesResult.data ?? []
  const stores = storesResult.data ?? []
  const storeMembers = storeMembersResult.data ?? []

  const ownedStores = new Map<string,string[]>()
  for (const store of stores) {
    const list = ownedStores.get(store.owner_id) ?? []
    list.push(store.name)
    ownedStores.set(store.owner_id,list)
  }

  const memberships = new Map<string,string[]>()
  for (const member of storeMembers) {
    const store = stores.find(item => item.id === member.store_id)
    if (!store) continue
    const list = memberships.get(member.user_id) ?? []
    if (!list.includes(store.name)) list.push(store.name)
    memberships.set(member.user_id,list)
  }

  const admins = profiles.filter(profile => profile.role === 'admin').length
  const owners = profiles.filter(profile => profile.role === 'store_owner').length
  const couriers = profiles.filter(profile => profile.role === 'courier').length

  return (
    <div className="admin-page">
      <section className="admin-page-head">
        <div>
          <div className="admin-eyebrow">CONTAS DA PLATAFORMA</div>
          <h1>Usuários</h1>
          <p>Visualize administradores, responsáveis de lojas e entregadores cadastrados.</p>
        </div>
      </section>

      <section className="admin-compact-metrics">
        <article>
          <small>Total de perfis</small>
          <strong>{profiles.length}</strong>
          <span>contas carregadas</span>
        </article>
        <article>
          <small>Administradores</small>
          <strong>{admins}</strong>
          <span>acesso global</span>
        </article>
        <article>
          <small>Responsáveis de lojas</small>
          <strong>{owners}</strong>
          <span>contas comerciais</span>
        </article>
        <article>
          <small>Entregadores</small>
          <strong>{couriers}</strong>
          <span>contas de operação</span>
        </article>
      </section>

      <section className="admin-card admin-list-card">
        <header>
          <div>
            <span className="admin-card-kicker">ACESSOS</span>
            <h2>Usuários cadastrados</h2>
          </div>
        </header>

        <div className="admin-user-list">
          {profiles.map(profile => {
            const storesForUser = Array.from(new Set([
              ...(ownedStores.get(profile.id) ?? []),
              ...(memberships.get(profile.id) ?? []),
            ]))

            return (
              <article key={profile.id}>
                <span className="admin-user-avatar">
                  {profile.avatar_url
                    ? <img src={profile.avatar_url} alt=""/>
                    : (profile.full_name?.slice(0,1) ?? 'U')}
                </span>
                <span className="admin-user-copy">
                  <strong>{profile.full_name ?? 'Usuário'}</strong>
                  <small>{profile.phone ?? 'Telefone não informado'}</small>
                </span>
                <em className={'admin-role '+profile.role}>
                  {roleLabel[profile.role] ?? profile.role}
                </em>
                <span className="admin-user-store">
                  <small>Operação</small>
                  <strong>
                    {storesForUser.length
                      ? storesForUser.slice(0,2).join(' · ')
                      : profile.role === 'courier'
                        ? 'Rede de entregadores'
                        : 'Sem loja vinculada'}
                  </strong>
                </span>
                <span className="admin-user-date">
                  <small>Cadastro</small>
                  <strong>{date(profile.created_at)}</strong>
                </span>
              </article>
            )
          })}

          {!profiles.length ? (
            <div className="admin-empty">Nenhum usuário cadastrado.</div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
