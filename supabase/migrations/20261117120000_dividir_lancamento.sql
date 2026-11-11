-- História 3.8: Dividir um Lançamento (FR-15, UX-DR15, AD-2, AD-8, AD-14).
--
-- - `lancamentos.divisao` e `regras.divisao` (jsonb, objeto): a Divisão em
--   frações da linha-mãe e da Regra. O formato e as contas são do núcleo
--   (src/domain/divisao.ts); aqui só se guarda. `dividido_de_id` já existe
--   (3.5): a filha aponta para a mãe e é apagada junto com ela.
-- - A filha copia da mãe Nome, data, Parcela, cartão, Mês, Fatura e ordem da
--   Fatura; por isso a posição única `(fatura_id, ordem_fatura)` passa a valer
--   só para linhas-mãe (`dividido_de_id is null`). A restrição
--   `lancamentos_fatura_check` continua valendo para a filha.
-- - `referencias_cadastro()`: o Responsável também mora dentro das duas
--   Divisões (jsonb, sem contar uso: as filhas e a Regra é que contam).
-- - `recriar_filhas(mae, partes)`: interna. Põe as filhas da mãe nas `partes`
--   que o núcleo calculou: a parte com `filha_id` atualiza a filha (e a revive
--   se estava excluída), a sem `filha_id` cria, e a filha que sobra é excluída
--   em lógico (AD-16). Devolve os ids mexidos e grava os `filha_id` na
--   `divisao` da mãe. Nenhuma conta de Divisão mora aqui.
-- - `dividir_lancamento(p_itens)`: tudo ou nada. Cada item é `{ id, corpo,
--   partes }`; o `corpo` traz a `divisao` (objeto, ou nulo para desfazer) e,
--   das colunas da lista fechada, o que o núcleo decidiu (Responsável, saída
--   da fila, `editado_em`). Recusa: mãe inexistente, excluída, filha ou Ajuste;
--   mãe com Ajuste; partes que não batem com a Divisão ou que não somam o
--   Valor da mãe.
-- - `importar_fatura`: mesma assinatura de 7 argumentos. A linha nova grava
--   `divisao` e ganha as filhas; o casado mantém as filhas do previsto (os
--   dados da Fatura e os valores novos); o previsto novo nasce com a Divisão
--   e as filhas. As filhas entram por último, e os `join` por posição passam a
--   olhar só mães.

-- ------------------------------------------------------------------ colunas

alter table public.lancamentos
  add column divisao jsonb,
  add constraint lancamentos_divisao_check check (jsonb_typeof(divisao) = 'object');

comment on column public.lancamentos.divisao is
  'Divisão (História 3.8): na linha-mãe, as partes em frações; as filhas (dividido_de_id) levam os valores. Nulo = não dividida.';

alter table public.regras
  add column divisao jsonb,
  add constraint regras_divisao_check check (jsonb_typeof(divisao) = 'object');

comment on column public.regras.divisao is
  'Divisão em frações aprendida para o Nome (História 3.8). Nulo = sem Divisão.';

-- A filha repete a posição da mãe na Fatura.
drop index public.lancamentos_fatura_id_ordem_fatura_key;
create unique index lancamentos_fatura_id_ordem_fatura_key
  on public.lancamentos (fatura_id, ordem_fatura)
  where excluido_em is null and dividido_de_id is null;

-- ----------------------------------------------- referências aos cadastros

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
    ('tipo'::text, 'lancamentos'::text, 'revisao_dados'::text, 'jsonb'::text, false),
    ('responsavel'::text, 'lancamentos'::text, 'divisao'::text, 'jsonb'::text, false),
    ('responsavel'::text, 'regras'::text, 'divisao'::text, 'jsonb'::text, false)
$$;

-- ----------------------------------------------------------- recriar_filhas

create function public.recriar_filhas(p_mae_id uuid, p_partes jsonb)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  mae public.lancamentos;
  agora timestamptz := now();
  parte jsonb;
  idx integer := 0;
  filha uuid;
  ids uuid[] := '{}';
  sobras uuid[] := '{}';
  divisao_nova jsonb;
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  select * into mae
    from public.lancamentos as l
   where l.id = p_mae_id and l.owner_id = dono
     and l.excluido_em is null and l.dividido_de_id is null
     for update;
  if not found then
    raise exception 'divisao.mae_invalida';
  end if;
  if jsonb_typeof(p_partes) is distinct from 'array' then
    raise exception 'salvar.falhou';
  end if;
  divisao_nova := mae.divisao;

  for parte in select value from jsonb_array_elements(p_partes) loop
    if jsonb_typeof(parte) is distinct from 'object'
       or jsonb_typeof(parte -> 'responsavel_id') is distinct from 'string'
       or jsonb_typeof(parte -> 'valor_centavos') is distinct from 'number' then
      raise exception 'salvar.falhou';
    end if;
    filha := case when jsonb_typeof(parte -> 'filha_id') = 'string' then (parte ->> 'filha_id')::uuid end;
    if filha is not null then
      update public.lancamentos as f
         set nome = mae.nome,
             nome_normalizado = mae.nome_normalizado,
             apelido = mae.apelido,
             data = mae.data,
             parcela_n = mae.parcela_n,
             parcela_total = mae.parcela_total,
             final_cartao = mae.final_cartao,
             mes = mae.mes,
             fatura_id = mae.fatura_id,
             ordem_fatura = mae.ordem_fatura,
             lancado_por = mae.lancado_por,
             tipo_id = mae.tipo_id,
             observacao = mae.observacao,
             serie_id = mae.serie_id,
             origem_lancamento_id = mae.origem_lancamento_id,
             responsavel_id = (parte ->> 'responsavel_id')::uuid,
             valor_centavos = (parte ->> 'valor_centavos')::integer,
             status_id = case when parte ? 'status_id' then (parte ->> 'status_id')::uuid else f.status_id end,
             excluido_em = null
       where f.id = filha and f.owner_id = dono and f.dividido_de_id = mae.id;
      if not found then
        raise exception 'divisao.filha_invalida';
      end if;
    else
      insert into public.lancamentos (
        nome, nome_normalizado, apelido, valor_centavos, data, parcela_n, parcela_total,
        final_cartao, mes, fatura_id, ordem_fatura, lancado_por, status_id,
        responsavel_id, tipo_id, observacao, serie_id, origem_lancamento_id, dividido_de_id
      ) values (
        mae.nome, mae.nome_normalizado, mae.apelido, (parte ->> 'valor_centavos')::integer, mae.data,
        mae.parcela_n, mae.parcela_total, mae.final_cartao, mae.mes, mae.fatura_id, mae.ordem_fatura,
        mae.lancado_por,
        case when parte ? 'status_id' then (parte ->> 'status_id')::uuid else mae.status_id end,
        (parte ->> 'responsavel_id')::uuid, mae.tipo_id, mae.observacao, mae.serie_id,
        mae.origem_lancamento_id, mae.id
      )
      returning id into filha;
    end if;
    if filha = any (ids) then
      raise exception 'salvar.falhou';
    end if;
    ids := ids || filha;
    if jsonb_typeof(divisao_nova -> 'partes' -> idx) = 'object' then
      divisao_nova := jsonb_set(divisao_nova, array['partes', idx::text, 'filha_id'], to_jsonb(filha::text));
    end if;
    idx := idx + 1;
  end loop;

  -- A filha que sobra (menos partes, ou "Desfazer divisão") sai em lógico.
  with excluidas as (
    update public.lancamentos as f
       set excluido_em = agora
     where f.owner_id = dono and f.dividido_de_id = mae.id
       and f.excluido_em is null and f.id <> all (ids)
    returning f.id
  )
  select coalesce(array_agg(e.id), '{}') into sobras from excluidas as e;

  if idx > 0 then
    update public.lancamentos as l set divisao = divisao_nova where l.id = mae.id;
  end if;
  return ids || sobras;
end;
$$;

revoke execute on function public.recriar_filhas(uuid, jsonb) from public, anon;
grant execute on function public.recriar_filhas(uuid, jsonb) to authenticated;

-- -------------------------------------------------------- dividir_lancamento

create function public.dividir_lancamento(p_itens jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  colunas constant text[] := array[
    'divisao', 'responsavel_id', 'revisao_motivo', 'revisao_dados', 'revisado_em', 'editado_em'
  ];
  item jsonb;
  corpo jsonb;
  partes jsonb;
  mae public.lancamentos;
  tocadas uuid[] := '{}';
  vistos uuid[] := '{}';
  n_partes integer;
  soma bigint;
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'salvar.falhou';
  end if;
  if jsonb_array_length(p_itens) = 0 then
    return '[]'::jsonb;
  end if;
  if jsonb_array_length(p_itens) > 500 then
    raise exception 'salvar.falhou';
  end if;

  for item in select value from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(item) is distinct from 'object'
       or jsonb_typeof(item -> 'id') is distinct from 'string'
       or jsonb_typeof(item -> 'corpo') is distinct from 'object'
       or jsonb_typeof(item -> 'partes') is distinct from 'array' then
      raise exception 'salvar.falhou';
    end if;
    corpo := item -> 'corpo';
    partes := item -> 'partes';
    if not (corpo ? 'divisao')
       or exists (select 1 from jsonb_object_keys(corpo) as k where k <> all (colunas)) then
      raise exception 'salvar.falhou';
    end if;
    if (item ->> 'id')::uuid = any (vistos) then
      raise exception 'salvar.falhou';
    end if;
    vistos := vistos || (item ->> 'id')::uuid;

    select * into mae
      from public.lancamentos as l
     where l.id = (item ->> 'id')::uuid and l.owner_id = dono
       and l.excluido_em is null and l.dividido_de_id is null and l.ajuste_de_id is null
       for update;
    if not found then
      raise exception 'divisao.mae_invalida';
    end if;

    n_partes := jsonb_array_length(partes);
    if jsonb_typeof(corpo -> 'divisao') = 'object' then
      if jsonb_typeof(corpo -> 'divisao' -> 'partes') is distinct from 'array'
         or jsonb_array_length(corpo -> 'divisao' -> 'partes') <> n_partes
         or n_partes < 2 or n_partes > 10 then
        raise exception 'salvar.falhou';
      end if;
      if exists (
        select 1 from public.lancamentos as a
         where a.owner_id = dono and a.ajuste_de_id = mae.id and a.excluido_em is null
      ) then
        raise exception 'divisao.com_ajuste';
      end if;
      select coalesce(sum((p ->> 'valor_centavos')::bigint), 0) into soma
        from jsonb_array_elements(partes) as p;
      if soma <> mae.valor_centavos then
        raise exception 'divisao.soma_diferente';
      end if;
    elsif n_partes <> 0 then
      raise exception 'salvar.falhou';
    end if;

    update public.lancamentos as l
       set divisao = case when corpo ? 'divisao'
             then case when jsonb_typeof(corpo -> 'divisao') = 'object' then corpo -> 'divisao' end
             else l.divisao end,
           responsavel_id = case when corpo ? 'responsavel_id'
             then (corpo ->> 'responsavel_id')::uuid else l.responsavel_id end,
           revisao_motivo = case when corpo ? 'revisao_motivo'
             then (corpo ->> 'revisao_motivo')::public.revisao_motivo else l.revisao_motivo end,
           revisao_dados = case when corpo ? 'revisao_dados'
             then case when jsonb_typeof(corpo -> 'revisao_dados') = 'object'
               then corpo -> 'revisao_dados' end
             else l.revisao_dados end,
           revisado_em = case when corpo ? 'revisado_em'
             then (corpo ->> 'revisado_em')::timestamptz else l.revisado_em end,
           editado_em = case when corpo ? 'editado_em'
             then (corpo ->> 'editado_em')::timestamptz else l.editado_em end
     where l.id = mae.id;

    tocadas := tocadas || mae.id || public.recriar_filhas(mae.id, partes);
  end loop;

  return coalesce((
    select jsonb_agg(to_jsonb(l) order by l.mes, l.ordem_fatura nulls last, (l.dividido_de_id is not null), l.id)
      from public.lancamentos as l
     where l.owner_id = dono and l.id = any (tocadas)
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.dividir_lancamento(jsonb) from public, anon;
grant execute on function public.dividir_lancamento(jsonb) to authenticated;

-- ---------------------------------------------------------- importar_fatura

create or replace function public.importar_fatura(
  dados_fatura jsonb,
  dados_cartoes jsonb,
  dados_lancamentos jsonb,
  lancamentos_atualizados_em timestamptz default null,
  substituir_fatura_id uuid default null,
  dados_previstos jsonb default null,
  previstos_sem_par jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  mes_fatura text := dados_fatura ->> 'mes';
  anterior uuid;
  fatura public.faturas;
  status_padrao uuid;
  ultima timestamptz;
  cartoes jsonb;
  linhas jsonb;
  previstos jsonb;
  religados jsonb;
  removidos jsonb := null;
  removidos_cartoes jsonb;
  removidos_lancamentos jsonb;
  removidos_previstos jsonb;
  esperados integer;
  casados integer;
  sem_par jsonb;
  rec record;
  criados uuid[];
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if jsonb_typeof(dados_cartoes) is distinct from 'array'
     or jsonb_typeof(dados_lancamentos) is distinct from 'array'
     or (dados_previstos is not null and jsonb_typeof(dados_previstos) is distinct from 'array')
     or (previstos_sem_par is not null and jsonb_typeof(previstos_sem_par) is distinct from 'array') then
    raise exception 'salvar.falhou';
  end if;

  -- Uma importação por vez para o mesmo dono e Mês.
  perform pg_advisory_xact_lock(hashtextextended(dono::text || ':' || coalesce(mes_fatura, ''), 0));

  select f.id into anterior
    from public.faturas as f
   where f.owner_id = dono and f.mes = mes_fatura;

  if substituir_fatura_id is null then
    if anterior is not null then
      raise exception 'fatura.mes_ja_importado';
    end if;
  elsif anterior is distinct from substituir_fatura_id then
    raise exception 'fatura.mes_mudou';
  end if;

  select max(l.updated_at) into ultima
    from public.lancamentos as l
   where l.owner_id = dono and l.mes = mes_fatura;
  if ultima is distinct from lancamentos_atualizados_em then
    raise exception 'fatura.mes_mudou';
  end if;

  -- Linha da Fatura que nasceu de um previsto (casada): a reimportação simples
  -- a apagaria com o `id` e a classificação. A 3.12 (reimportar mantendo a
  -- classificação) é quem vai poder fazer isso.
  if anterior is not null and exists (
    select 1 from public.lancamentos as l
     where l.owner_id = dono and l.fatura_id = anterior
       and l.casado_em is not null and l.excluido_em is null
  ) then
    raise exception 'fatura.reimportacao_com_casados';
  end if;

  if anterior is not null then
    -- Os previstos que a Fatura anterior criou e ninguém tocou saem junto;
    -- os editados ou excluídos ficam (a origem vira nula e a importação nova
    -- os religa).
    with apagados as (
      delete from public.lancamentos as p
       where p.owner_id = dono
         and p.lancado_por = 'sistema'
         and p.editado_em is null
         and p.excluido_em is null
         and p.origem_lancamento_id in (
           select l.id from public.lancamentos as l
            where l.owner_id = dono and l.fatura_id = anterior
         )
      returning p.id
    )
    select coalesce(jsonb_agg(a.id order by a.id), '[]'::jsonb) into removidos_previstos
      from apagados as a;

    -- Os Ajustes saem junto com as mães (`ajuste_de_id` é `set null`).
    with apagados as (
      delete from public.lancamentos as l
       where l.owner_id = dono and l.fatura_id = anterior
      returning l.id
    )
    select coalesce(jsonb_agg(a.id order by a.id), '[]'::jsonb) into removidos_lancamentos
      from apagados as a;

    select coalesce(jsonb_agg(c.id order by c.id), '[]'::jsonb) into removidos_cartoes
      from public.fatura_cartoes as c
     where c.owner_id = dono and c.fatura_id = anterior;

    -- Os cartões caem por `on delete cascade`.
    delete from public.faturas as f
     where f.owner_id = dono and f.id = anterior;

    removidos := jsonb_build_object(
      'fatura_id', anterior,
      'cartoes', removidos_cartoes,
      'lancamentos', removidos_lancamentos,
      'previstos', removidos_previstos
    );
  end if;

  select c.status_padrao_id into status_padrao
    from public.configuracoes as c
   where c.owner_id = dono;

  -- Séries das linhas parceladas: acha ou cria (a chave vem do núcleo).
  insert into public.series (
    nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia
  )
  select distinct
    l -> 'serie' ->> 'nome_normalizado',
    (l -> 'serie' ->> 'parcela_total')::integer,
    (l -> 'serie' ->> 'valor_parcela_centavos')::integer,
    l -> 'serie' ->> 'mes_primeira_parcela',
    (l -> 'serie' ->> 'ocorrencia')::integer
    from jsonb_array_elements(dados_lancamentos) as l
   where jsonb_typeof(l -> 'serie') = 'object'
     and jsonb_typeof(l -> 'previsto_id') is distinct from 'string'
  on conflict (owner_id, nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia)
  do nothing;

  -- Rede de segurança: a parcela (sem casamento calculado pelo núcleo) já tem
  -- uma linha na Série. Com o casamento (3.6) isto só acontece se o Mês mudou
  -- depois da leitura; a importação inteira é recusada e nada é gravado.
  if exists (
    select 1
      from jsonb_array_elements(dados_lancamentos) as l
      join public.series as s
        on s.owner_id = dono
       and s.nome_normalizado = l -> 'serie' ->> 'nome_normalizado'
       and s.parcela_total = (l -> 'serie' ->> 'parcela_total')::integer
       and s.valor_parcela_centavos = (l -> 'serie' ->> 'valor_parcela_centavos')::integer
       and s.mes_primeira_parcela = l -> 'serie' ->> 'mes_primeira_parcela'
       and s.ocorrencia = (l -> 'serie' ->> 'ocorrencia')::integer
      join public.lancamentos as x
        on x.owner_id = dono
       and x.serie_id = s.id
       and x.parcela_n = (l ->> 'parcela_n')::integer
       and x.dividido_de_id is null
       and x.excluido_em is null
     where jsonb_typeof(l -> 'serie') = 'object'
       and jsonb_typeof(l -> 'previsto_id') is distinct from 'string'
  ) then
    raise exception 'fatura.previstos_sem_casamento';
  end if;

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

  -- Casamento (História 3.6): cada previsto casado vira a linha real da
  -- Fatura, na mesma linha (mantém `id`, Série, Apelido, Observação, Status e
  -- `editado_em`). O núcleo já decidiu Responsável, Tipo e motivo.
  select count(*) into esperados
    from jsonb_array_elements(dados_lancamentos) as l
   where jsonb_typeof(l -> 'previsto_id') = 'string';

  update public.lancamentos as p
     set nome = l ->> 'nome',
         valor_centavos = (l ->> 'valor_centavos')::integer,
         data = (l ->> 'data')::date,
         final_cartao = l ->> 'final_cartao',
         fatura_id = fatura.id,
         ordem_fatura = (l ->> 'ordem_fatura')::integer,
         duvida_extracao = coalesce((l ->> 'duvida_extracao')::boolean, false),
         lancado_por = 'fatura'::public.lancado_por,
         casado_em = now(),
         responsavel_id = (l ->> 'responsavel_id')::uuid,
         tipo_id = (l ->> 'tipo_id')::uuid,
         revisao_motivo = (l ->> 'revisao_motivo')::public.revisao_motivo,
         revisao_dados = case when jsonb_typeof(l -> 'revisao_dados') = 'object' then l -> 'revisao_dados' end
    from jsonb_array_elements(dados_lancamentos) as l
   where jsonb_typeof(l -> 'previsto_id') = 'string'
     and p.id = (l ->> 'previsto_id')::uuid
     and p.owner_id = dono
     and p.lancado_por = 'sistema'
     and p.excluido_em is null
     and p.fatura_id is null
     and p.mes = mes_fatura
     and p.nome_normalizado = l ->> 'nome_normalizado'
     and p.parcela_n = (l ->> 'parcela_n')::integer
     and p.parcela_total = (l ->> 'parcela_total')::integer;
  get diagnostics casados = row_count;
  -- Previsto que sumiu, mudou de Mês ou já foi casado: o plano do núcleo
  -- ficou velho.
  if casados <> esperados then
    raise exception 'fatura.mes_mudou';
  end if;

  -- Casado dividido (História 3.8): as filhas do previsto passam a ser da
  -- Fatura (mesmos dados da mãe) e levam os valores que o núcleo calculou
  -- (mudam só se o Valor da Fatura é outro).
  update public.lancamentos as f
     set nome = m.nome,
         nome_normalizado = m.nome_normalizado,
         data = m.data,
         final_cartao = m.final_cartao,
         fatura_id = m.fatura_id,
         ordem_fatura = m.ordem_fatura,
         lancado_por = m.lancado_por,
         tipo_id = m.tipo_id,
         valor_centavos = coalesce((pt ->> 'valor_centavos')::integer, f.valor_centavos)
    from jsonb_array_elements(dados_lancamentos) as l
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(l -> 'partes') = 'array' then l -> 'partes' else '[]'::jsonb end
    ) as pt
    join public.lancamentos as m
      on m.owner_id = dono and m.id = (l ->> 'previsto_id')::uuid
   where jsonb_typeof(l -> 'previsto_id') = 'string'
     and f.owner_id = dono
     and f.dividido_de_id = m.id
     and f.excluido_em is null
     and f.id = (pt ->> 'filha_id')::uuid;

  insert into public.lancamentos (
    nome, nome_normalizado, valor_centavos, data, parcela_n, parcela_total,
    final_cartao, mes, fatura_id, ordem_fatura, duvida_extracao, lancado_por, status_id,
    responsavel_id, tipo_id, revisao_motivo, revisao_dados, serie_id, apelido, observacao, divisao
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
    case when jsonb_typeof(l -> 'revisao_dados') = 'object' then l -> 'revisao_dados' end,
    s.id,
    l ->> 'apelido',
    l ->> 'observacao',
    case when jsonb_typeof(l -> 'divisao') = 'object' then l -> 'divisao' end
    from jsonb_array_elements(dados_lancamentos) as l
    left join public.series as s
      on jsonb_typeof(l -> 'serie') = 'object'
     and s.owner_id = dono
     and s.nome_normalizado = l -> 'serie' ->> 'nome_normalizado'
     and s.parcela_total = (l -> 'serie' ->> 'parcela_total')::integer
     and s.valor_parcela_centavos = (l -> 'serie' ->> 'valor_parcela_centavos')::integer
     and s.mes_primeira_parcela = l -> 'serie' ->> 'mes_primeira_parcela'
     and s.ocorrencia = (l -> 'serie' ->> 'ocorrencia')::integer
   where jsonb_typeof(l -> 'previsto_id') is distinct from 'string';

  -- Ajustes: cada um aponta para a linha da mesma Fatura com a ordem da mãe.
  update public.lancamentos as a
     set ajuste_de_id = m.id
    from jsonb_array_elements(dados_lancamentos) as l
    join public.lancamentos as m
      on m.fatura_id = fatura.id
     and m.dividido_de_id is null
     and m.ordem_fatura = (l ->> 'ajuste_de_ordem')::integer
   where a.fatura_id = fatura.id
     and a.ordem_fatura = (l ->> 'ordem_fatura')::integer
     and jsonb_typeof(l -> 'ajuste_de_ordem') = 'number';

  -- Previstos que já existiam e ficaram sem origem (reimportação): voltam a
  -- apontar para a linha nova da mesma Série.
  with atualizados as (
    update public.lancamentos as p
       set origem_lancamento_id = r.id
      from public.lancamentos as r
     where r.owner_id = dono
       and r.fatura_id = fatura.id
       and r.dividido_de_id is null
       and r.serie_id is not null
       and p.owner_id = dono
       and p.serie_id = r.serie_id
       and p.lancado_por = 'sistema'
       and p.origem_lancamento_id is null
       and p.excluido_em is null
       and p.parcela_n > r.parcela_n
    returning p.*
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.mes, g.parcela_n), '[]'::jsonb) into religados
    from atualizados as g;

  -- Previstos novos. Não cria o que a Série já tem em qualquer estado (um
  -- previsto excluído não ressuscita) nem em Mês que já tem Fatura (o núcleo
  -- já deixa esses de fora; aqui é rede de segurança contra duas importações
  -- de aparelhos diferentes).
  with gravados as (
    insert into public.lancamentos (
      nome, nome_normalizado, apelido, valor_centavos, parcela_n, parcela_total, mes,
      lancado_por, status_id, responsavel_id, tipo_id, observacao, serie_id, origem_lancamento_id, divisao
    )
    select
      p ->> 'nome',
      p ->> 'nome_normalizado',
      p ->> 'apelido',
      (p ->> 'valor_centavos')::integer,
      (p ->> 'parcela_n')::integer,
      (p ->> 'parcela_total')::integer,
      p ->> 'mes',
      'sistema'::public.lancado_por,
      status_padrao,
      (p ->> 'responsavel_id')::uuid,
      (p ->> 'tipo_id')::uuid,
      p ->> 'observacao',
      r.serie_id,
      r.id,
      case when jsonb_typeof(p -> 'divisao') = 'object' then p -> 'divisao' end
      from jsonb_array_elements(coalesce(dados_previstos, '[]'::jsonb)) as p
      join public.lancamentos as r
        on r.owner_id = dono
       and r.fatura_id = fatura.id
       and r.ordem_fatura = (p ->> 'ordem_origem')::integer
       and r.dividido_de_id is null
     where r.serie_id is not null
       and not exists (
         select 1 from public.lancamentos as x
          where x.owner_id = dono
            and x.serie_id = r.serie_id
            and x.parcela_n = (p ->> 'parcela_n')::integer
            and x.dividido_de_id is null
       )
       and not exists (
         select 1 from public.faturas as f
          where f.owner_id = dono and f.mes = p ->> 'mes'
       )
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.mes, g.parcela_n), '[]'::jsonb) into previstos
    from gravados as g;

  -- Previstos novos com Divisão (História 3.8): nascem com as filhas (mesmo
  -- Valor, então os mesmos centavos que o núcleo calculou).
  select coalesce(array_agg((g ->> 'id')::uuid), '{}') into criados
    from jsonb_array_elements(previstos) as g;
  for rec in
    select (g ->> 'id')::uuid as mae_id, p -> 'partes' as partes
      from jsonb_array_elements(previstos) as g
      join jsonb_array_elements(coalesce(dados_previstos, '[]'::jsonb)) as p
        on (g ->> 'parcela_n')::integer = (p ->> 'parcela_n')::integer
      join public.lancamentos as o
        on o.owner_id = dono
       and o.fatura_id = fatura.id
       and o.dividido_de_id is null
       and o.ordem_fatura = (p ->> 'ordem_origem')::integer
       and o.serie_id = (g ->> 'serie_id')::uuid
     where jsonb_typeof(p -> 'partes') = 'array'
  loop
    perform public.recriar_filhas(rec.mae_id, rec.partes);
  end loop;
  if cardinality(criados) > 0 then
    select coalesce(jsonb_agg(to_jsonb(g) order by g.mes, g.parcela_n, g.dividido_de_id nulls first, g.id), '[]'::jsonb)
      into previstos
      from public.lancamentos as g
     where g.owner_id = dono and (g.id = any (criados) or g.dividido_de_id = any (criados));
  end if;

  -- Previstos do Mês que a Fatura não trouxe: continuam previstos e vão para a
  -- fila como "Não veio na fatura".
  with marcados as (
    update public.lancamentos as p
       set revisao_motivo = 'nao_veio_na_fatura'::public.revisao_motivo,
           revisao_dados = null
     where p.owner_id = dono
       and p.mes = mes_fatura
       and p.lancado_por = 'sistema'
       and p.excluido_em is null
       and p.id in (
         select (v #>> '{}')::uuid
           from jsonb_array_elements(coalesce(previstos_sem_par, '[]'::jsonb)) as v
          where jsonb_typeof(v) = 'string'
       )
    returning p.*
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.parcela_n, g.id), '[]'::jsonb) into sem_par
    from marcados as g;

  -- Linhas novas com Divisão (Regra ou herança): as filhas, por último, para
  -- os `join` por `ordem_fatura` acima nunca verem uma filha.
  for rec in
    select m.id as mae_id, l -> 'partes' as partes
      from jsonb_array_elements(dados_lancamentos) as l
      join public.lancamentos as m
        on m.owner_id = dono
       and m.fatura_id = fatura.id
       and m.dividido_de_id is null
       and m.ordem_fatura = (l ->> 'ordem_fatura')::integer
     where jsonb_typeof(l -> 'previsto_id') is distinct from 'string'
       and jsonb_typeof(l -> 'partes') = 'array'
  loop
    perform public.recriar_filhas(rec.mae_id, rec.partes);
  end loop;

  select coalesce(jsonb_agg(to_jsonb(g) order by g.ordem_fatura, g.dividido_de_id nulls first, g.id), '[]'::jsonb) into linhas
    from public.lancamentos as g
   where g.fatura_id = fatura.id;

  return jsonb_build_object(
    'fatura', to_jsonb(fatura),
    'cartoes', cartoes,
    'lancamentos', linhas,
    'previstos', previstos || religados || sem_par,
    'removidos', removidos
  );
exception
  -- Duas importações do mesmo Mês ao mesmo tempo: a segunda esbarra no único
  -- (a trava já as serializa; isto é a rede de segurança). A parcela que já
  -- tem linha na Série (duas importações de Meses diferentes ao mesmo tempo)
  -- é o mesmo caso do previsto sem casamento.
  when unique_violation then
    if sqlerrm like '%faturas_owner_id_mes_key%' then
      raise exception 'fatura.mes_ja_importado';
    end if;
    if sqlerrm like '%lancamentos_serie_id_parcela_n_key%' then
      raise exception 'fatura.previstos_sem_casamento';
    end if;
    raise;
end;
$$;

revoke execute on function public.importar_fatura(jsonb, jsonb, jsonb, timestamptz, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.importar_fatura(jsonb, jsonb, jsonb, timestamptz, uuid, jsonb, jsonb) to authenticated;
