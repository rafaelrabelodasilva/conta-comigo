-- História 3.1: Regras que aprendem com a classificação (FR-9/10/11, AD-6).
--
-- - `regras`: uma por dono e chave. A chave é `chaveDeRegra(nome)` do núcleo
--   (src/domain/regras.ts), nunca calculada aqui. Guarda o Responsável e o
--   Tipo da última classificação, a contagem por Responsável
--   (`[{"responsavel_id": "...", "n": 3}]`, ids só como valores) e o último
--   uso. Só `regrasRepo.aprender()` grava (upsert por owner_id, chave).
-- - `lancamentos.revisao_motivo` e `revisao_dados`: o que a importação manda
--   para a fila do Revisar (a tela e o contador chegam na 3.2). A sugestão
--   (`{responsavel_id, tipo_id, outros_responsaveis: []}`) também guarda ids
--   só como valores.
-- - `referencias_cadastro()`: as Regras (colunas e contagem) e a sugestão da
--   fila citam cadastros sem contar uso. `substituir_cadastro` passa a trocar
--   o id dentro do jsonb e, sem substituto, a anular o id no documento.
-- - `importar_fatura`: mesma assinatura da 2.8, gravando também a
--   classificação calculada pelo núcleo (`classificarImportacao`).
--
-- Nenhuma Regra é criada a partir do que já existe (decisão do Rafael,
-- 09/11/2026, 3-A): elas nascem das próximas classificações.

-- ------------------------------------------------------------------ regras

create table public.regras (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  -- chaveDeRegra(nome) do núcleo.
  chave text not null,
  -- VERSAO_NORMALIZACAO do núcleo quando a chave foi calculada.
  versao_normalizacao integer not null,
  -- O Responsável e o Tipo da linha na última classificação.
  responsavel_id uuid,
  tipo_id uuid,
  -- [{"responsavel_id": "<uuid>", "n": 3}]: quantas vezes cada Responsável foi escolhido.
  contagem jsonb not null default '[]'::jsonb,
  -- Momento do último `aprender`.
  ultimo_uso timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regras_chave_check check (char_length(chave) >= 1 and char_length(chave) <= 200),
  constraint regras_versao_normalizacao_check check (versao_normalizacao >= 1),
  constraint regras_contagem_check check (jsonb_typeof(contagem) = 'array'),
  constraint regras_owner_id_chave_key unique (owner_id, chave),
  -- Excluir o Responsável ou o Tipo anula só a coluna da Regra.
  constraint regras_responsavel_fkey
    foreign key (owner_id, responsavel_id)
    references public.responsaveis (owner_id, id)
    on delete set null (responsavel_id),
  constraint regras_tipo_fkey
    foreign key (owner_id, tipo_id)
    references public.tipos (owner_id, id)
    on delete set null (tipo_id)
);

comment on table public.regras is
  'Regras (Glossário): para cada chave de Nome, o Responsável e o Tipo aprendidos e a contagem por Responsável.';

-- Sustentam as chaves compostas (e a substituição de cadastros).
create index regras_owner_id_responsavel_id_idx on public.regras (owner_id, responsavel_id);
create index regras_owner_id_tipo_id_idx on public.regras (owner_id, tipo_id);

create trigger regras_definir_updated_at
  before insert or update on public.regras
  for each row execute function public.definir_updated_at();

alter table public.regras enable row level security;

create policy "regras_select_dono" on public.regras
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "regras_insert_dono" on public.regras
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "regras_update_dono" on public.regras
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "regras_delete_dono" on public.regras
  for delete to authenticated
  using (owner_id = (select auth.uid()));

alter table public.regras replica identity full;
alter publication supabase_realtime add table public.regras;

-- ------------------------------------------------------ fila do Revisar

-- Por que a linha está na fila (a 3.6 e a 3.11 acrescentam valores).
create type public.revisao_motivo as enum ('sem_classificacao', 'sugestao', 'sugestao_duvida');

alter table public.lancamentos
  add column revisao_motivo public.revisao_motivo,
  add column revisao_dados jsonb;

alter table public.lancamentos
  add constraint lancamentos_revisao_dados_check check (jsonb_typeof(revisao_dados) = 'object');

comment on column public.lancamentos.revisao_motivo is
  'Fila do Revisar: por que a linha precisa de revisão. Nulo = fora da fila. Classificar (Responsável e Tipo) limpa.';
comment on column public.lancamentos.revisao_dados is
  'Sugestão da fila: {responsavel_id, tipo_id, outros_responsaveis: []} (ids só como valores).';

-- ----------------------------------------------- referências aos cadastros

-- As Regras e a sugestão da fila citam cadastros sem contar uso: excluir sem
-- substituto anula a coluna (ou o id no documento). Espelha
-- REFERENCIAS_COLUNAS e REFERENCIAS_JSONB de src/domain/cadastros.ts.
create or replace function public.referencias_cadastro()
returns table (cadastro text, tabela text, coluna text, forma text, conta_uso boolean)
language sql
immutable
set search_path = ''
as $$
  values
    ('status'::text, 'configuracoes'::text, 'status_padrao_id'::text, 'coluna'::text, false),
    ('responsavel'::text, 'lancamentos'::text, 'responsavel_id'::text, 'coluna'::text, true),
    ('tipo'::text, 'lancamentos'::text, 'tipo_id'::text, 'coluna'::text, true),
    ('status'::text, 'lancamentos'::text, 'status_id'::text, 'coluna'::text, true),
    ('responsavel'::text, 'regras'::text, 'responsavel_id'::text, 'coluna'::text, false),
    ('tipo'::text, 'regras'::text, 'tipo_id'::text, 'coluna'::text, false),
    ('responsavel'::text, 'regras'::text, 'contagem'::text, 'jsonb'::text, false),
    ('responsavel'::text, 'lancamentos'::text, 'revisao_dados'::text, 'jsonb'::text, false),
    ('tipo'::text, 'lancamentos'::text, 'revisao_dados'::text, 'jsonb'::text, false)
$$;

-- Troca o id `de` por null no documento. Só para referências jsonb sem
-- conta_uso, que guardam ids só como valores (um id usado como chave daria
-- um documento inválido). Sem `de`, devolve o documento como veio.
create or replace function public.anular_id_jsonb(doc jsonb, de uuid)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when doc is null or de is null then doc
    else replace(doc::text, '"' || de::text || '"', 'null')::jsonb
  end
$$;

revoke execute on function public.anular_id_jsonb(jsonb, uuid) from public, anon;
grant execute on function public.anular_id_jsonb(jsonb, uuid) to authenticated;

-- Igual à da História 1.6, com o ramo jsonb sem substituto: uma referência
-- jsonb sem conta_uso não bloqueia a exclusão, e o id vira null no
-- documento; com conta_uso, continua exigindo substituto. Com substituto,
-- o id é trocado no documento (trocar_id_jsonb).
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

  -- Uso: sem substituto, nada que conta uso pode citar o excluído.
  for ref in
    select r.tabela, r.coluna, r.forma
      from public.referencias_cadastro() as r
     where r.cadastro = substituir_cadastro.cadastro
       and r.conta_uso
  loop
    if ref.forma = 'coluna' then
      execute format('select count(*) from public.%I where owner_id = $1 and %I = $2', ref.tabela, ref.coluna)
        into n using dono, de_id;
    else
      execute format('select count(*) from public.%I where owner_id = $1 and strpos(%I::text, $2) > 0',
        ref.tabela, ref.coluna)
        into n using dono, texto_de;
    end if;
    usos := usos + n;
  end loop;
  if usos > 0 and para_id is null then
    raise exception 'cadastro.em_uso';
  end if;

  -- Troca as referências (sem substituto, as colunas e os ids no jsonb viram nulo).
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
    else
      execute format(
        'update public.%I set %I = public.anular_id_jsonb(%I, $1) where owner_id = $2 and strpos(%I::text, $3) > 0',
        ref.tabela, ref.coluna, ref.coluna, ref.coluna)
        using de_id, dono, texto_de;
    end if;
  end loop;

  execute format('delete from public.%I where id = $1 and owner_id = $2', tabela_cadastro)
    using de_id, dono;
end;
$$;

revoke execute on function public.substituir_cadastro(text, uuid, uuid) from public, anon;
grant execute on function public.substituir_cadastro(text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------- importar_fatura

-- Igual à da História 2.8 (mesma assinatura), mais a classificação: cada
-- linha de `dados_lancamentos` pode trazer `responsavel_id`, `tipo_id`,
-- `revisao_motivo` e `revisao_dados`, calculados pelo núcleo
-- (`classificarImportacao`; o Ajuste já vem com a classificação da mãe). Os
-- ids são validados pelo dono nas chaves estrangeiras compostas.
create or replace function public.importar_fatura(
  dados_fatura jsonb,
  dados_cartoes jsonb,
  dados_lancamentos jsonb,
  lancamentos_atualizados_em timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  mes_fatura text := dados_fatura ->> 'mes';
  fatura public.faturas;
  status_padrao uuid;
  ultima timestamptz;
  cartoes jsonb;
  linhas jsonb;
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if jsonb_typeof(dados_cartoes) is distinct from 'array'
     or jsonb_typeof(dados_lancamentos) is distinct from 'array' then
    raise exception 'salvar.falhou';
  end if;

  -- Uma importação por vez para o mesmo dono e Mês.
  perform pg_advisory_xact_lock(hashtextextended(dono::text || ':' || coalesce(mes_fatura, ''), 0));

  if exists (select 1 from public.faturas as f where f.owner_id = dono and f.mes = mes_fatura) then
    raise exception 'fatura.mes_ja_importado';
  end if;

  select max(l.updated_at) into ultima
    from public.lancamentos as l
   where l.owner_id = dono and l.mes = mes_fatura;
  if ultima is distinct from lancamentos_atualizados_em then
    raise exception 'fatura.mes_mudou';
  end if;

  select c.status_padrao_id into status_padrao
    from public.configuracoes as c
   where c.owner_id = dono;

  insert into public.faturas (
    mes, vencimento, fechamento, total_despesas_centavos, total_creditos_centavos,
    saldo_anterior_centavos, pagamentos_centavos, total_a_pagar_centavos
  ) values (
    mes_fatura,
    (dados_fatura ->> 'vencimento')::date,
    (dados_fatura ->> 'fechamento')::date,
    (dados_fatura ->> 'total_despesas_centavos')::integer,
    (dados_fatura ->> 'total_creditos_centavos')::integer,
    (dados_fatura ->> 'saldo_anterior_centavos')::integer,
    (dados_fatura ->> 'pagamentos_centavos')::integer,
    (dados_fatura ->> 'total_a_pagar_centavos')::integer
  )
  returning * into fatura;

  with gravados as (
    insert into public.fatura_cartoes (fatura_id, final, total_centavos)
    select fatura.id, c ->> 'final', (c ->> 'total_centavos')::integer
      from jsonb_array_elements(dados_cartoes) as c
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.final), '[]'::jsonb) into cartoes
    from gravados as g;

  insert into public.lancamentos (
    nome, nome_normalizado, valor_centavos, data, parcela_n, parcela_total,
    final_cartao, mes, fatura_id, ordem_fatura, duvida_extracao, lancado_por, status_id,
    responsavel_id, tipo_id, revisao_motivo, revisao_dados
  )
  select
    l ->> 'nome',
    l ->> 'nome_normalizado',
    (l ->> 'valor_centavos')::integer,
    (l ->> 'data')::date,
    (l ->> 'parcela_n')::integer,
    (l ->> 'parcela_total')::integer,
    l ->> 'final_cartao',
    mes_fatura,
    fatura.id,
    (l ->> 'ordem_fatura')::integer,
    coalesce((l ->> 'duvida_extracao')::boolean, false),
    'fatura'::public.lancado_por,
    status_padrao,
    (l ->> 'responsavel_id')::uuid,
    (l ->> 'tipo_id')::uuid,
    (l ->> 'revisao_motivo')::public.revisao_motivo,
    case when jsonb_typeof(l -> 'revisao_dados') = 'object' then l -> 'revisao_dados' end
    from jsonb_array_elements(dados_lancamentos) as l;

  -- Ajustes: cada um aponta para a linha da mesma Fatura com a ordem da mãe.
  update public.lancamentos as a
     set ajuste_de_id = m.id
    from jsonb_array_elements(dados_lancamentos) as l
    join public.lancamentos as m
      on m.fatura_id = fatura.id
     and m.ordem_fatura = (l ->> 'ajuste_de_ordem')::integer
   where a.fatura_id = fatura.id
     and a.ordem_fatura = (l ->> 'ordem_fatura')::integer
     and jsonb_typeof(l -> 'ajuste_de_ordem') = 'number';

  select coalesce(jsonb_agg(to_jsonb(g) order by g.ordem_fatura), '[]'::jsonb) into linhas
    from public.lancamentos as g
   where g.fatura_id = fatura.id;

  return jsonb_build_object('fatura', to_jsonb(fatura), 'cartoes', cartoes, 'lancamentos', linhas);
exception
  -- Duas importações do mesmo Mês ao mesmo tempo: a segunda esbarra no único.
  when unique_violation then
    if sqlerrm like '%faturas_owner_id_mes_key%' then
      raise exception 'fatura.mes_ja_importado';
    end if;
    raise;
end;
$$;

revoke execute on function public.importar_fatura(jsonb, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.importar_fatura(jsonb, jsonb, jsonb, timestamptz) to authenticated;
