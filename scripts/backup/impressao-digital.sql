-- Impressão digital do banco (História 1.10): uma linha `secao|chave|valor`
-- por item, em ordem fixa, para comparar o banco de origem com o restaurado.
--
--   dados      toda tabela de `public` e auth.users/auth.identities:
--              "<linhas> <md5 do conteúdo ordenado>"
--   rls        RLS ligado e forçado, por tabela de `public`
--   replica    replica identity (f = full), por tabela de `public`
--   politica   md5 de cada política RLS de `public`
--   realtime   tabelas da publicação supabase_realtime
--   funcao     md5 da definição de cada função de `public`
--   gatilho    md5 de cada gatilho das tabelas de `public`
--   restricao  md5 de cada restrição de `public`
--   acl_tabela privilégios (GRANT/REVOKE) de cada tabela de `public`
--   acl_funcao privilégios de cada função de `public`
--   acl_padrao privilégios padrão (ALTER DEFAULT PRIVILEGES) do postgres
--   indice     md5 de cada índice de `public`
--
-- Uso: psql -X -v ON_ERROR_STOP=1 -d <db-url> -f scripts/backup/impressao-digital.sql
-- Só lê o banco. Não imprime conteúdo de linhas, só contagens e hashes.

\set QUIET on
\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'
\pset footer off

-- Texto das linhas igual em qualquer sessão.
set timezone = 'UTC';
set datestyle = 'ISO, YMD';
set intervalstyle = 'postgres';
set extra_float_digits = 3;
set bytea_output = 'hex';
set search_path = public;

-- Dados: gera uma consulta só (union all) e a executa com \gexec.
select string_agg(
         format(
           $q$select 'dados' as secao, %L as chave, count(*)::text || ' ' || md5(coalesce(string_agg(t::text, E'\n' order by t::text), '')) as valor from %I.%I t$q$,
           n.nspname || '.' || c.relname, n.nspname, c.relname
         ),
         E'\nunion all\n' order by n.nspname, c.relname
       ) || E'\norder by 2'
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname in ('users', 'identities')))
\gexec

select secao, chave, valor from (
  select 'rls' as secao, c.relname::text as chave,
         c.relrowsecurity::text || ' ' || c.relforcerowsecurity::text as valor
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  union all
  select 'replica', c.relname::text, c.relreplident::text
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  union all
  select 'politica', p.tablename || '.' || p.policyname,
         md5(concat_ws(' ', p.permissive, p.roles::text, p.cmd, p.qual, p.with_check))
  from pg_policies p
  where p.schemaname = 'public'
  union all
  select 'realtime', pt.schemaname || '.' || pt.tablename, 'publicada'
  from pg_publication_tables pt
  where pt.pubname = 'supabase_realtime'
  union all
  select 'funcao', p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid))
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
  union all
  select 'gatilho', c.relname || '.' || t.tgname, md5(pg_get_triggerdef(t.oid))
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
  union all
  select 'restricao', c.relname || '.' || k.conname, md5(pg_get_constraintdef(k.oid))
  from pg_constraint k
  join pg_class c on c.oid = k.conrelid
  where k.connamespace = 'public'::regnamespace
  union all
  select 'acl_tabela', c.relname::text, coalesce(c.relacl::text, '(padrão)')
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  union all
  select 'acl_funcao', p.oid::regprocedure::text, coalesce(p.proacl::text, '(padrão)')
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
  union all
  select 'acl_padrao', r.rolname || '.' || coalesce(n.nspname, '(todos)') || '.' || d.defaclobjtype::text,
         d.defaclacl::text
  from pg_default_acl d
  join pg_roles r on r.oid = d.defaclrole
  left join pg_namespace n on n.oid = d.defaclnamespace
  where r.rolname = 'postgres'
  union all
  select 'indice', i.tablename || '.' || i.indexname, md5(i.indexdef)
  from pg_indexes i
  where i.schemaname = 'public'
) itens
order by 1, 2;
