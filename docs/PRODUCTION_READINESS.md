# ChamaEntrega — checklist de prontidão para produção

Este documento registra o que já foi automatizado e o que precisa ser validado antes do lançamento público.

## Já automatizado no repositório

- Build de produção no CI.
- TypeScript sem erros.
- `npm audit --audit-level=high`.
- CodeQL para JavaScript/TypeScript.
- Lighthouse CI na página pública.
- Smoke test do servidor de produção.
- Healthcheck em `/api/health`.
- `robots.txt` e `sitemap.xml`.
- Canonical, Open Graph, Twitter Card e JSON-LD.
- Áreas privadas e de autenticação com `noindex` e `no-store`.
- Cabeçalhos de segurança básicos.
- CSP em modo Report-Only para observar incompatibilidades antes de bloquear conteúdo.
- Home pública prerenderizada como conteúdo estático.
- CSS público separado dos estilos privados.
- `package-lock.json` versionado.
- Dependabot configurado.
- APIs internas sensíveis validam sessão, origem do navegador, Content-Type e tamanho real do payload, inclusive quando `Content-Length` está ausente.
- Home pública confirmada como cacheável no servidor de produção (`s-maxage=31536000`) e protegida por smoke test contra regressão para `no-store`.
- Menu mobile e modais públicos prendem o foco do teclado, fecham com `Escape`, restauram o foco ao elemento de origem e bloqueiam o scroll de fundo.
- Modais públicos possuem altura máxima e rolagem interna para não cortar conteúdo em celulares e telas baixas.
- Teste de regressão cobre destinos não permitidos no callback de autenticação.
- MFA/TOTP obrigatório na Central Administrativa: senha sozinha não abre `/admin`.
- Cadastro do autenticador e desafio AAL2 implementados em `/admin/mfa/setup` e `/admin/mfa`.
- Token de acesso do WhatsApp armazenado no Supabase Vault; não existe mais coluna de token em texto puro.
- Tabela de credenciais do WhatsApp sem acesso direto para `anon` ou `authenticated`.
- Todos os 36 objetos de tabela do schema público com RLS habilitado na auditoria atual.
- Nenhuma política de leitura de tabela de negócio liberada para `anon`.
- Nenhuma função do schema `public` executável por `anon`.
- Funções de trigger internas removidas da superfície RPC.
- Novas funções do schema público passam a nascer sem `EXECUTE` público por padrão.
- Privilégios `TRUNCATE`, `REFERENCES` e `TRIGGER` revogados de clientes `anon`/`authenticated`.
- Bucket de logos limitado a 5 MB e a PNG/JPEG/WebP, com escrita somente na pasta do próprio usuário.
- Bucket de documentos de verificação privado, limitado a 8 MB e a imagens permitidas.
- Políticas antigas duplicadas de Storage removidas.
- Índices adicionados às chaves estrangeiras apontadas pelo advisor do Supabase.
- Callback de autenticação limitado somente a `/onboarding` e `/reset-password`, sem destinos arbitrários.
- Cadastro não revela se um e-mail já possui conta, reduzindo enumeração de usuários.
- Criação de entregas valida UUIDs, coordenadas, formas de pagamento, comprimentos e limites numéricos antes do banco.
- Registro manual de pagamento de assinatura é transacional no PostgreSQL e protegido contra duplicidade em janela curta.
- RPC de pagamento administrativo exige MFA AAL2 no próprio banco.
- Todas as 5 Edge Functions implantadas estão versionadas no GitHub e alinhadas byte a byte com o código do Supabase.
- Edge Functions checks executa `deno check` em todas as funções a cada alteração em `supabase/functions/**`.
- `create-wallet-topup` exige JWT no gateway e também valida a sessão internamente.
- Webhooks Pix, WhatsApp e Push validam assinatura/segredo antes de usar credenciais administrativas; logs Pix foram sanitizados para não registrar payload bruto do provedor.
- Edge Functions públicas possuem limites de payload; chamadas externas críticas possuem timeout.
- A função que credita carteira é idempotente, usa bloqueio de linha e só pode ser executada por `service_role`.
- Quality Checks e Lighthouse CI usam permissões explícitas `contents: read`.
- FAQ visível e JSON-LD compartilham a mesma fonte de dados para evitar divergência de SEO.
- Histórico de migrations está sincronizado 1:1 entre GitHub e Supabase: 46 versões em cada lado na auditoria atual.

- Páginas públicas de Privacidade e Segurança e Termos de Uso já existem, possuem canonical e entram no sitemap.
- O rodapé não exibe mais redes sociais ou canais de contato fictícios enquanto os dados oficiais não forem definidos.

## Antes de apontar um domínio

- Definir `NEXT_PUBLIC_SITE_URL=https://dominio-real`.
- Confirmar domínio permitido no Supabase Auth.
- Confirmar URLs de callback de autenticação e recuperação de senha.
- Configurar variáveis da Meta/WhatsApp, Woovi, Firebase e segredos de webhooks somente no ambiente do servidor.
- Nunca copiar chaves privadas ou segredos para variáveis `NEXT_PUBLIC_*`.
- Usar `supabase/functions/.env.example` somente como referência de nomes; manter os valores reais nos Secrets do Supabase.
- Validar o CSP Report-Only no ambiente real antes de convertê-lo em política bloqueante.
- Entrar uma vez com cada conta administrativa e concluir o cadastro do autenticador TOTP.

## Segurança que ainda exige ação

- **Ativar Leaked Password Protection no Supabase Auth.** O advisor de segurança ainda aponta essa configuração como desabilitada. Ela depende de uma configuração do projeto no Auth, não de migration SQL e permanece como ação manual antes do lançamento.
- Manter revisão periódica das funções `SECURITY DEFINER` expostas a `authenticated`. As RPCs atuais usam `auth.uid()` ou helpers privados de autorização, mas devem ser reavaliadas quando a regra de negócio mudar.
- Revisar periodicamente as políticas RLS após novas tabelas ou integrações.
- Manter rotinas administrativas separadas do Portal da Loja.
- Não criar nova função `SECURITY DEFINER` sem `search_path` explícito, validação de autorização e grants mínimos.
- Converter o CSP de Report-Only para bloqueante somente depois de observar o site no domínio real.
- Definir rate limiting durável no gateway/banco para endpoints autenticados que consomem serviços externos (geocodificação, criação de cobrança Pix e conexão WhatsApp), evitando soluções apenas em memória em ambiente serverless.

## Infraestrutura / hospedagem

Validar somente quando houver um ambiente público:

- HTTPS e renovação automática do certificado.
- HSTS real no domínio final.
- DNS.
- CDN e cache.
- Compressão Brotli/Gzip.
- TTFB real fora do ambiente de CI.
- Monitoramento de uptime usando `/api/health`.
- Logs e alertas de erro.
- Backup e política de recuperação do banco.

## SEO e conteúdo

Antes do lançamento:

- Informar pelo menos um contato oficial real no footer (e-mail, WhatsApp ou canal de suporte). Não publicar contato inventado.
- Adicionar links reais para Instagram/WhatsApp/e-mail somente depois de definidos os canais oficiais.
- Revisar título e descrição usando o domínio e posicionamento comercial definitivos.
- Cadastrar o domínio no Google Search Console.
- Enviar `/sitemap.xml` no Search Console.
- Validar Open Graph em uma URL pública.

## Meta de qualidade

O CI deve permanecer verde em:

- Quality checks
- CodeQL
- Edge Functions checks
- Lighthouse audit

Alterações que reduzam significativamente Lighthouse, quebrem o build ou introduzam vulnerabilidades de nível alto devem ser corrigidas antes de merge/deploy.
