-- Reduz a superfície de injeção por search_path em funções SECURITY DEFINER.
-- Várias RPCs autenticadas usam search_path=public por compatibilidade com o app.
-- Como consequência, o schema public não pode ser gravável por usuários não confiáveis.

revoke create on schema public from public;
revoke create on schema public from anon;
revoke create on schema public from authenticated;

grant usage on schema public to anon;
grant usage on schema public to authenticated;

-- Defesa adicional: funções novas não devem nascer executáveis para PUBLIC.
alter default privileges for role postgres
  revoke execute on functions from public;

-- Mantém explícita a política adotada no projeto: RPCs públicas devem receber
-- grants individuais nas migrations que as criam.
comment on schema public is
  'API schema. CREATE is denied to anon/authenticated; SECURITY DEFINER RPCs must validate auth.uid()/role and use explicit EXECUTE grants.';
