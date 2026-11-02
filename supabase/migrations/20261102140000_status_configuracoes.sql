-- História 1.6: Status (Glossário), Configurações (uma linha por dono) e a
-- exclusão de cadastros em uso por substituição.
-- Mesmo padrão de `responsaveis` e `tipos` (AD-3/4/5/14/16): dono por
-- auth.uid(), RLS com políticas owner_id = auth.uid(), updated_at só pelo
-- banco (reusa public.definir_updated_at()), replica identity full e
-- publicação no Realtime. As regras (nome, arquivar o padrão, substituto
-- válido) ficam no núcleo (src/domain/status.ts e cadastros.ts); aqui só as
-- restrições e a RPC transacional.

-- ---------------------------------------------------------------- status

create table public.status (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  nome text not null,
  conta_como_pago boolean not null default false,
  arquivado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint status_nome_check
    check (nome = btrim(nome) and char_length(nome) between 1 and 30),
  -- Alvo da chave estrangeira composta de `configuracoes`: o Status padrão
  -- é sempre do mesmo dono. O índice também serve aos filtros por dono.
  constraint status_owner_id_id_key unique (owner_id, id)
);

comment on table public.status is
  'Status (Glossário): situação de pagamento de cada linha (Não pago, Pago…). conta_como_pago marca os que contam como pagos.';

create trigger status_definir_updated_at
  before insert or update on public.status
  for each row execute function public.definir_updated_at();

alter table public.status enable row level security;

create policy "status_select_dono" on public.status
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "status_insert_dono" on public.status
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "status_update_dono" on public.status
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Usada só pela RPC substituir_cadastro (security invoker): o app nunca
-- apaga Status com delete direto.
create policy "status_delete_dono" on public.status
  for delete to authenticated
  using (owner_id = (select auth.uid()));

alter table public.status replica identity full;
alter publication supabase_realtime add table public.status;

-- ---------------------------------------------------------- configuracoes

-- Uma linha por dono. Ciclo e Aparência chegam na História 1.7.
create table public.configuracoes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  -- Status das linhas novas; nulo = "Nenhum (não pago)".
  status_padrao_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint configuracoes_owner_id_key unique (owner_id),
  -- Excluir o Status padrão sem substituto o anula (só essa coluna).
  constraint configuracoes_status_padrao_fkey
    foreign key (owner_id, status_padrao_id)
    references public.status (owner_id, id)
    on delete set null (status_padrao_id)
);

comment on table public.configuracoes is
  'Configurações do dono (uma linha por dono): Status padrão das linhas novas.';

create trigger configuracoes_definir_updated_at
  before insert or update on public.configuracoes
  for each row execute function public.definir_updated_at();

alter table public.configuracoes enable row level security;

create policy "configuracoes_select_dono" on public.configuracoes
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "configuracoes_insert_dono" on public.configuracoes
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "configuracoes_update_dono" on public.configuracoes
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "configuracoes_delete_dono" on public.configuracoes
  for delete to authenticated
  using (owner_id = (select auth.uid()));

alter table public.configuracoes replica identity full;
alter publication supabase_realtime add table public.configuracoes;

-- O Status padrão das linhas novas não pode ser arquivado (vale também para
-- outro aparelho ou um update direto, não só para a tela).
create or replace function public.impedir_arquivar_status_padrao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.arquivado and not old.arquivado and exists (
    select 1
      from public.configuracoes as c
     where c.owner_id = new.owner_id
       and c.status_padrao_id = new.id
  ) then
    raise exception 'status.padrao_nao_arquiva';
  end if;
  return new;
end;
$$;

create trigger status_impedir_arquivar_padrao
  before update on public.status
  for each row execute function public.impedir_arquivar_status_padrao();

-- ----------------------------------------------- referências aos cadastros

-- Lista fixa de onde cada cadastro (responsavel, tipo, status) é citado.
-- Espelha REFERENCIAS_COLUNAS e REFERENCIAS_JSONB de src/domain/cadastros.ts
-- (o teste de integração exige que sejam iguais). Toda história que criar
-- uma referência a um cadastro acrescenta uma linha aqui e na constante.
--   forma 'coluna': a coluna guarda o id (uuid);
--   forma 'jsonb':  o id aparece como texto "<uuid>" (valor ou chave) no documento;
--   conta_uso: entra na contagem "N registros" e exige substituto ao excluir.
create or replace function public.referencias_cadastro()
returns table (cadastro text, tabela text, coluna text, forma text, conta_uso boolean)
language sql
immutable
set search_path = ''
as $$
  values
    ('status'::text, 'configuracoes'::text, 'status_padrao_id'::text, 'coluna'::text, false)
$$;

revoke execute on function public.referencias_cadastro() from public, anon;
grant execute on function public.referencias_cadastro() to authenticated;

-- Chaves estrangeiras do schema public que apontam para responsaveis, tipos
-- ou status e NÃO estão em referencias_cadastro() (forma 'coluna'). Para FK
-- composta, a coluna é a que corresponde ao `id` referenciado. O teste de
-- integração exige lista vazia: referência nova fora da lista quebra o CI.
-- security definer para ler o catálogo; só o service_role executa.
create or replace function public.referencias_fk_nao_listadas()
returns table (tabela text, coluna text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.relname::text, a.attname::text
    from pg_catalog.pg_constraint as con
    join pg_catalog.pg_class as t on t.oid = con.conrelid
    join pg_catalog.pg_namespace as n on n.oid = t.relnamespace
    join pg_catalog.pg_class as r on r.oid = con.confrelid
    join pg_catalog.pg_namespace as rn on rn.oid = r.relnamespace
    cross join lateral unnest(con.conkey, con.confkey) as k(col, refcol)
    join pg_catalog.pg_attribute as ra on ra.attrelid = con.confrelid and ra.attnum = k.refcol
    join pg_catalog.pg_attribute as a on a.attrelid = con.conrelid and a.attnum = k.col
   where con.contype = 'f'
     and n.nspname = 'public'
     and rn.nspname = 'public'
     and r.relname in ('responsaveis', 'tipos', 'status')
     and ra.attname = 'id'
     and not exists (
       select 1
         from public.referencias_cadastro() as rc
        where rc.forma = 'coluna'
          and rc.tabela = t.relname::text
          and rc.coluna = a.attname::text
          and rc.cadastro = case r.relname
                              when 'responsaveis' then 'responsavel'
                              when 'tipos' then 'tipo'
                              else 'status'
                            end
     )
$$;

revoke execute on function public.referencias_fk_nao_listadas() from public, anon, authenticated;
grant execute on function public.referencias_fk_nao_listadas() to service_role;

-- Troca o id `de` por `para` em qualquer lugar do documento (valores e
-- chaves, em qualquer nível): ids são uuid minúsculos, então o texto
-- "<de>" (com aspas) só aparece onde o id está. Sem `de` ou `para`,
-- devolve o documento como veio.
create or replace function public.trocar_id_jsonb(doc jsonb, de uuid, para uuid)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when doc is null or de is null or para is null then doc
    else replace(doc::text, '"' || de::text || '"', '"' || para::text || '"')::jsonb
  end
$$;

revoke execute on function public.trocar_id_jsonb(jsonb, uuid, uuid) from public, anon;
grant execute on function public.trocar_id_jsonb(jsonb, uuid, uuid) to authenticated;

-- Contagem de uso de cada item do cadastro (só referências com conta_uso),
-- para o "N registros" de Configurações. Itens sem uso vêm com 0.
-- security invoker: o RLS limita tudo ao dono.
create or replace function public.contar_usos_cadastro(cadastro text)
returns table (id uuid, usos bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  tabela_cadastro text;
  ref record;
  partes text[] := '{}';
begin
  tabela_cadastro := case contar_usos_cadastro.cadastro
    when 'responsavel' then 'responsaveis'
    when 'tipo' then 'tipos'
    when 'status' then 'status'
  end;
  if tabela_cadastro is null then
    raise exception 'cadastro.invalido';
  end if;

  for ref in
    select r.tabela, r.coluna, r.forma
      from public.referencias_cadastro() as r
     where r.cadastro = contar_usos_cadastro.cadastro
       and r.conta_uso
  loop
    if ref.forma = 'coluna' then
      partes := partes || format(
        'select t.%1$I as id from public.%2$I as t where t.owner_id = (select auth.uid()) and t.%1$I is not null',
        ref.coluna, ref.tabela);
    else
      -- Um uso por registro cujo documento cita o id.
      partes := partes || format(
        'select c.id from public.%2$I as t join public.%3$I as c on c.owner_id = t.owner_id '
        'where t.owner_id = (select auth.uid()) and strpos(t.%1$I::text, ''"'' || c.id::text || ''"'') > 0',
        ref.coluna, ref.tabela, tabela_cadastro);
    end if;
  end loop;

  if cardinality(partes) = 0 then
    return query execute format(
      'select c.id, 0::bigint from public.%I as c where c.owner_id = (select auth.uid())',
      tabela_cadastro);
  else
    return query execute format(
      'select c.id, count(u.id)::bigint from public.%I as c left join (%s) as u on u.id = c.id '
      'where c.owner_id = (select auth.uid()) group by c.id',
      tabela_cadastro, array_to_string(partes, ' union all '));
  end if;
end;
$$;

revoke execute on function public.contar_usos_cadastro(text) from public, anon;
grant execute on function public.contar_usos_cadastro(text) to authenticated;

-- Exclui o item `de_id` do cadastro numa transação: troca o id por
-- `para_id` em todas as referências de referencias_cadastro() e apaga o
-- item. Sem substituto (para_id nulo), só exclui se nada que conta uso o
-- citar; as referências que não contam uso (ex.: Status padrão) viram nulo.
-- security invoker: o RLS vale como numa gravação comum; ainda assim tudo é
-- filtrado pelo dono, e o substituto precisa ser do mesmo dono e cadastro,
-- ativo e diferente do excluído. Erros saem como códigos do núcleo
-- (cadastro.*), que o repositório repassa à tela.
create or replace function public.substituir_cadastro(cadastro text, de_id uuid, para_id uuid default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  tabela_cadastro text;
  achou boolean;
  ref record;
  usos bigint := 0;
  n bigint;
  texto_de text := '"' || de_id::text || '"';
begin
  tabela_cadastro := case substituir_cadastro.cadastro
    when 'responsavel' then 'responsaveis'
    when 'tipo' then 'tipos'
    when 'status' then 'status'
  end;
  if tabela_cadastro is null then
    raise exception 'cadastro.invalido';
  end if;
  if dono is null or de_id is null then
    raise exception 'cadastro.nao_encontrado';
  end if;

  -- O excluído existe e é do dono (trava a linha até o fim).
  execute format('select true from public.%I where id = $1 and owner_id = $2 for update', tabela_cadastro)
    into achou using de_id, dono;
  if achou is null then
    raise exception 'cadastro.nao_encontrado';
  end if;

  -- O substituto: mesmo cadastro e dono, ativo e diferente do excluído.
  if para_id is not null then
    if para_id = de_id then
      raise exception 'cadastro.substituto_invalido';
    end if;
    achou := null;
    execute format(
      'select true from public.%I where id = $1 and owner_id = $2 and not arquivado for share',
      tabela_cadastro)
      into achou using para_id, dono;
    if achou is null then
      raise exception 'cadastro.substituto_invalido';
    end if;
  end if;

  -- Uso: sem substituto, nada que conta uso pode citar o excluído. Um
  -- documento jsonb que o cite também exige substituto (não há como anular
  -- uma chave).
  for ref in
    select r.tabela, r.coluna, r.forma, r.conta_uso
      from public.referencias_cadastro() as r
     where r.cadastro = substituir_cadastro.cadastro
  loop
    if ref.forma = 'coluna' then
      if ref.conta_uso then
        execute format('select count(*) from public.%I where owner_id = $1 and %I = $2', ref.tabela, ref.coluna)
          into n using dono, de_id;
        usos := usos + n;
      end if;
    else
      execute format('select count(*) from public.%I where owner_id = $1 and strpos(%I::text, $2) > 0',
        ref.tabela, ref.coluna)
        into n using dono, texto_de;
      if ref.conta_uso or para_id is null then
        usos := usos + n;
      end if;
    end if;
  end loop;
  if usos > 0 and para_id is null then
    raise exception 'cadastro.em_uso';
  end if;

  -- Troca as referências (sem substituto, as colunas viram nulo).
  for ref in
    select r.tabela, r.coluna, r.forma
      from public.referencias_cadastro() as r
     where r.cadastro = substituir_cadastro.cadastro
  loop
    if ref.forma = 'coluna' then
      execute format('update public.%I set %I = $1 where owner_id = $2 and %I = $3',
        ref.tabela, ref.coluna, ref.coluna)
        using para_id, dono, de_id;
    elsif para_id is not null then
      execute format(
        'update public.%I set %I = public.trocar_id_jsonb(%I, $1, $2) where owner_id = $3 and strpos(%I::text, $4) > 0',
        ref.tabela, ref.coluna, ref.coluna, ref.coluna)
        using de_id, para_id, dono, texto_de;
    end if;
  end loop;

  execute format('delete from public.%I where id = $1 and owner_id = $2', tabela_cadastro)
    using de_id, dono;
end;
$$;

revoke execute on function public.substituir_cadastro(text, uuid, uuid) from public, anon;
grant execute on function public.substituir_cadastro(text, uuid, uuid) to authenticated;
