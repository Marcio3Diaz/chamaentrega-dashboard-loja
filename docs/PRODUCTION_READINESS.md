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
- Áreas privadas e de autenticação com `noindex`.
- Cabeçalhos de segurança básicos.
- CSP em modo Report-Only para observar incompatibilidades antes de bloquear conteúdo.
- Home pública prerenderizada como conteúdo estático.
- CSS público separado dos estilos privados.
- `package-lock.json` versionado.
- Dependabot configurado.
- Upload de logos limitado por MIME, tamanho e pasta do usuário.
- APIs internas sensíveis validam sessão e origem do navegador.

## Antes de apontar um domínio

- Definir `NEXT_PUBLIC_SITE_URL=https://dominio-real`.
- Confirmar domínio permitido no Supabase Auth.
- Confirmar URLs de callback de autenticação e recuperação de senha.
- Configurar variáveis da Meta/WhatsApp somente no ambiente do servidor.
- Nunca copiar chaves privadas ou segredos para variáveis `NEXT_PUBLIC_*`.
- Validar o CSP Report-Only no ambiente real antes de convertê-lo em política bloqueante.

## Segurança que ainda merece evolução

- Tornar MFA obrigatório para contas administrativas antes do lançamento público.
- Migrar o token de acesso do WhatsApp para armazenamento criptografado/Vault, evitando segredo em texto puro no banco.
- Revisar periodicamente as políticas RLS após novas tabelas ou integrações.
- Manter rotinas administrativas separadas do Portal da Loja.
- Evitar novas funções `security definer` sem `search_path` explícito e validação de autorização.

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
