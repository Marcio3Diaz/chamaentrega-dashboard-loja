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
- APIs internas sensíveis validam sessão, origem do navegador, Content-Type e tamanho de payload.
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

## Antes de apontar um domínio

- Definir `NEXT_PUBLIC_SITE_URL=https://dominio-real`.
- Confirmar domínio permitido no Supabase Auth.
- Confirmar URLs de callback de autenticação e recuperação de senha.
- Configurar variáveis da Meta/WhatsApp somente no ambiente do servidor.
- Nunca copiar chaves privadas ou segredos para variáveis `NEXT_PUBLIC_*`.
- Validar o CSP Report-Only no ambiente real antes de convertê-lo em política bloqueante.
- Entrar uma vez com cada conta administrativa e concluir o cadastro do autenticador TOTP.

## Segurança que ainda exige ação

- **Ativar Leaked Password Protection no Supabase Auth.** O advisor de segurança ainda aponta essa configuração como desabilitada. Ela depende de uma configuração do projeto no Auth, não de migration SQL.
- Manter revisão periódica das funções `SECURITY DEFINER` expostas a `authenticated`. As RPCs atuais usam `auth.uid()` ou helpers privados de autorização, mas devem ser reavaliadas quando a regra de negócio mudar.
- Revisar periodicamente as políticas RLS após novas tabelas ou integrações.
- Manter rotinas administrativas separadas do Portal da Loja.
- Não criar nova função `SECURITY DEFINER` sem `search_path` explícito, validação de autorização e grants mínimos.
- Converter o CSP de Report-Only para bloqueante somente depois de observar o site no domínio real.

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

- Informar contatos reais no footer.
- Adicionar links reais para Instagram/WhatsApp/e-mail.
- Revisar título e descrição usando o domínio e posicionamento comercial definitivos.
- Cadastrar o domínio no Google Search Console.
- Enviar `/sitemap.xml` no Search Console.
- Validar Open Graph em uma URL pública.

## Meta de qualidade

O CI deve permanecer verde em:

- Quality checks
- CodeQL
- Lighthouse audit

Alterações que reduzam significativamente Lighthouse, quebrem o build ou introduzam vulnerabilidades de nível alto devem ser corrigidas antes de merge/deploy.
