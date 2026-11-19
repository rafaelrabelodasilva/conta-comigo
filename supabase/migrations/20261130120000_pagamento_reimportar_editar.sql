-- Historia 6.9: Editar, excluir e reimportar algo ja pago (FR-46, FR-51, AD-10, AD-11, AD-14, AD-15, AD-16).
--
-- Nenhuma tabela, coluna, tipo nem permissao muda. Duas funcoes ganham a trava de estrutura que o AD-15
-- pede, por "create or replace" (mesma assinatura, mesmos grant). Quem decide e o nucleo
-- (src/domain/reimportacao.ts, alterar-conta.ts, aviso-pagamento.ts); o SQL so garante a restricao
-- "linha com Pagamento nao e apagada".
--
-- - importar_fatura (a de 8 argumentos da 3.12): linha com item de pagamento_itens (vivo ou de um
--   Pagamento desfeito, a FK segura os dois) nunca e apagada.
--     * viva sem par e com item: o nucleo ja a manda em "sumiram" (referenciadas); a RPC so confere: se
--       ela chegar em "apagar" o plano esta velho e responde fatura.mes_mudou (antes, a FK derrubava a
--       transacao e a tela dizia so "Nao foi possivel importar");
--     * EXCLUIDA e com item: deixa de ser apagada (r_excluidas) e fica como esta, excluida, com o
--       Pagamento: o credito de AD-11 continua no Saldo, e a linha da Fatura nova volta como nova (como
--       toda excluida, 3.11). Os indices unicos da Fatura e da Serie so olham linhas nao excluidas,
--       entao a linha mantida nao atrapalha;
--     * o previsto "sistema" que alguma linha apagada criou tambem nao e apagado se tem item (a FK).
-- - excluir_linhas_da_conta (5.4, usada por alterar_conta_manual e excluir_conta_manual): recusa
--   (conta.mudou) excluir em logico uma linha com item de Pagamento VIVO. O nucleo (comPagamento) ja
--   tira essas linhas do plano; a trava cobre o Pagamento registrado depois da leitura sem depender so
--   do updated_at. recriar_filhas e dividir_lancamento NAO mudam (spec 6.9, decisao 8).

-- ------------------------------------------------------------ importar_fatura

create or replace function public.importar_fatura(
  dados_fatura jsonb,
  dados_cartoes jsonb,
  dados_lancamentos jsonb,
  lancamentos_atualizados_em timestamptz default null,
  substituir_fatura_id uuid default null,
  dados_previstos jsonb default null,
  previstos_sem_par jsonb default null,
  dados_reimportacao jsonb default null
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
  r_apagar uuid[] := '{}';
  r_sumiram uuid[] := '{}';
  r_voltar uuid[] := '{}';
  r_pares uuid[] := '{}';
  r_vivas uuid[];
  r_todas uuid[];
  r_excluidas uuid[];
  ids_com_item uuid[];
  ids_previstos uuid[];
  ids_destacados uuid[] := '{}';
  ids_filhas uuid[];
  n_pares integer;
  destacados jsonb := '[]'::jsonb;
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

  if anterior is not null then
    -- Reimportação mantendo a classificação (História 3.12): o núcleo casou as
    -- linhas novas com as antigas (`antiga_id`) e decidiu o destino das que
    -- sobraram (`apagar`, `sumiram`, `voltar_a_previsto`). Aqui só se confere
    -- que o plano cobre, uma vez cada, exatamente as linhas vivas da Fatura.
    if jsonb_typeof(dados_reimportacao) is distinct from 'object'
       or jsonb_typeof(dados_reimportacao -> 'apagar') is distinct from 'array'
       or jsonb_typeof(dados_reimportacao -> 'sumiram') is distinct from 'array'
       or jsonb_typeof(dados_reimportacao -> 'voltar_a_previsto') is distinct from 'array' then
      raise exception 'salvar.falhou';
    end if;
    select coalesce(array_agg((v #>> '{}')::uuid), '{}') into r_apagar
      from jsonb_array_elements(dados_reimportacao -> 'apagar') as v;
    select coalesce(array_agg((v #>> '{}')::uuid), '{}') into r_sumiram
      from jsonb_array_elements(dados_reimportacao -> 'sumiram') as v;
    select coalesce(array_agg((v #>> '{}')::uuid), '{}') into r_voltar
      from jsonb_array_elements(dados_reimportacao -> 'voltar_a_previsto') as v;
    select coalesce(array_agg((l ->> 'antiga_id')::uuid), '{}') into r_pares
      from jsonb_array_elements(dados_lancamentos) as l
     where jsonb_typeof(l -> 'antiga_id') = 'string';
    select coalesce(array_agg(l.id), '{}') into r_vivas
      from public.lancamentos as l
     where l.owner_id = dono and l.fatura_id = anterior
       and l.dividido_de_id is null and l.excluido_em is null;
    select coalesce(array_agg(l.id), '{}') into r_excluidas
      from public.lancamentos as l
     where l.owner_id = dono and l.fatura_id = anterior
       and l.dividido_de_id is null and l.excluido_em is not null;
    -- Pagamento (Historia 6.9, AD-15): qualquer item de pagamento_itens (vivo ou de um Pagamento
    -- desfeito) segura a linha da Fatura, ou uma parte dela, pela FK: ela nunca e apagada. A viva sem
    -- par que tem item chega aqui em "sumiram" (o nucleo manda "referenciadas" ao planejar); se chegar
    -- em "apagar" o plano esta velho (um Pagamento foi registrado depois da leitura) e nada e gravado.
    -- A excluida com item fica como esta, EXCLUIDA e com o Pagamento (o credito de AD-11 segue no
    -- Saldo), em vez de derrubar a reimportacao inteira pela FK.
    select coalesce(array_agg(m.id), '{}') into ids_com_item
      from public.lancamentos as m
     where m.owner_id = dono and m.fatura_id = anterior and m.dividido_de_id is null
       and exists (
         select 1
           from public.pagamento_itens as i
          where i.owner_id = dono
            and (i.lancamento_id = m.id
                 or i.lancamento_id in (
                   select f.id from public.lancamentos as f where f.owner_id = dono and f.dividido_de_id = m.id
                 ))
       );
    if exists (select 1 from unnest(r_apagar) as x where x = any (ids_com_item)) then
      raise exception 'fatura.mes_mudou';
    end if;
    -- A excluida com item sai de r_excluidas (nao e apagada) e nao precisa de mais nada: continua excluida.
    select coalesce(array_agg(x), '{}') into r_excluidas
      from unnest(r_excluidas) as x where x <> all (ids_com_item);
    r_todas := r_pares || r_apagar || r_sumiram || r_voltar;
    if cardinality(r_todas) <> cardinality(r_vivas)
       or (select count(distinct x) from unnest(r_todas) as x) <> cardinality(r_todas)
       or exists (select 1 from unnest(r_todas) as x where x <> all (r_vivas)) then
      raise exception 'fatura.mes_mudou';
    end if;

    -- Os previstos que as linhas apagadas criaram saem junto, mas só os que
    -- ninguém tocou e que não estão na fila "Não veio na fatura". Os outros
    -- ficam (a origem vira nula e a importação nova os religa).
    select coalesce(array_agg(p.id), '{}') into ids_previstos
      from public.lancamentos as p
     where p.owner_id = dono
       and p.lancado_por = 'sistema'
       and p.editado_em is null
       and p.excluido_em is null
       and p.dividido_de_id is null
       and p.revisao_motivo is distinct from 'nao_veio_na_fatura'::public.revisao_motivo
       and p.origem_lancamento_id = any (r_apagar || r_excluidas)
       and not exists (
         select 1
           from public.pagamento_itens as i
          where i.owner_id = dono
            and (i.lancamento_id = p.id
                 or i.lancamento_id in (
                   select f.id from public.lancamentos as f where f.owner_id = dono and f.dividido_de_id = p.id
                 ))
       );
    select coalesce(array_agg(f.id), '{}') into ids_filhas
      from public.lancamentos as f
     where f.owner_id = dono and f.dividido_de_id = any (ids_previstos);
    removidos_previstos := to_jsonb(array(select x from unnest(ids_previstos || ids_filhas) as x order by x));
    delete from public.lancamentos as p where p.owner_id = dono and p.id = any (ids_previstos);

    -- Linhas sem par (e as excluídas): apagadas, com as filhas e os Ajustes.
    select coalesce(array_agg(f.id), '{}') into ids_filhas
      from public.lancamentos as f
     where f.owner_id = dono and f.dividido_de_id = any (r_apagar || r_excluidas);
    removidos_lancamentos := to_jsonb(array(select x from unnest(r_apagar || r_excluidas || ids_filhas) as x order by x));
    delete from public.lancamentos as l where l.owner_id = dono and l.id = any (r_apagar || r_excluidas);

    -- Sem par, mas com o que Rafael fez (`sumiram`): saem da Fatura como linha
    -- `manual` e vão ao Revisar. Sem par e vindas de um previsto
    -- (`voltar_a_previsto`): voltam a ser previsto, na fila "Não veio".
    with destacadas as (
      update public.lancamentos as l
         set fatura_id = null,
             ordem_fatura = null,
             duvida_extracao = false,
             data = case when l.id = any (r_voltar) or l.dividido_de_id = any (r_voltar) then null else l.data end,
             final_cartao = case when l.id = any (r_voltar) or l.dividido_de_id = any (r_voltar) then null else l.final_cartao end,
             lancado_por = case when l.id = any (r_voltar) or l.dividido_de_id = any (r_voltar)
               then 'sistema' else 'manual' end::public.lancado_por,
             casado_em = case when l.id = any (r_voltar) then null else l.casado_em end,
             revisao_motivo = case
               when l.dividido_de_id is not null or l.ajuste_de_id is not null then null
               when l.id = any (r_voltar) then 'nao_veio_na_fatura'
               else 'sumiu_na_reimportacao' end::public.revisao_motivo,
             revisao_dados = null
       where l.owner_id = dono
         and (l.id = any (r_voltar || r_sumiram) or l.dividido_de_id = any (r_voltar || r_sumiram))
      returning l.id
    )
    select coalesce(array_agg(d.id), '{}') into ids_destacados from destacadas as d;

    select coalesce(jsonb_agg(c.id order by c.id), '[]'::jsonb) into removidos_cartoes
      from public.fatura_cartoes as c
     where c.owner_id = dono and c.fatura_id = anterior;
    delete from public.fatura_cartoes as c where c.owner_id = dono and c.fatura_id = anterior;

    -- A Fatura fica no mesmo lugar (as linhas mantidas continuam apontando para ela).
    removidos := jsonb_build_object(
      'fatura_id', null,
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

  if anterior is null then
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
  else
    -- Reimportação: os totais são os da Fatura nova e o alerta da Conferência volta.
    update public.faturas as f
       set vencimento = (dados_fatura ->> 'vencimento')::date,
           fechamento = (dados_fatura ->> 'fechamento')::date,
           total_despesas_centavos = (dados_fatura ->> 'total_despesas_centavos')::integer,
           total_creditos_centavos = (dados_fatura ->> 'total_creditos_centavos')::integer,
           saldo_anterior_centavos = (dados_fatura ->> 'saldo_anterior_centavos')::integer,
           pagamentos_centavos = (dados_fatura ->> 'pagamentos_centavos')::integer,
           total_a_pagar_centavos = (dados_fatura ->> 'total_a_pagar_centavos')::integer,
           alerta_dispensado_em = null
     where f.id = anterior and f.owner_id = dono
    returning * into fatura;
  end if;

  with gravados as (
    insert into public.fatura_cartoes (fatura_id, final, total_centavos)
    select fatura.id, c ->> 'final', (c ->> 'total_centavos')::integer
      from jsonb_array_elements(dados_cartoes) as c
    returning *
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.final), '[]'::jsonb) into cartoes
    from gravados as g;

  -- Reimportação (História 3.12): a linha nova com `antiga_id` é a antiga, no
  -- mesmo lugar. Mantém `id`, Responsável/Tipo que o núcleo decidiu (a
  -- classificação da antiga vence), Status, Observação, Apelido, Série e
  -- `editado_em`; troca o que vem da Fatura. As posições sobem 1.000.000 antes
  -- para a troca não esbarrar no índice único da Fatura.
  if cardinality(r_pares) > 0 then
    update public.lancamentos as a
       set ordem_fatura = a.ordem_fatura + 1000000
     where a.owner_id = dono and a.id = any (r_pares);

    update public.lancamentos as a
       set nome = l ->> 'nome',
           nome_normalizado = l ->> 'nome_normalizado',
           valor_centavos = (l ->> 'valor_centavos')::integer,
           data = (l ->> 'data')::date,
           final_cartao = l ->> 'final_cartao',
           ordem_fatura = (l ->> 'ordem_fatura')::integer,
           duvida_extracao = coalesce((l ->> 'duvida_extracao')::boolean, false),
           responsavel_id = (l ->> 'responsavel_id')::uuid,
           tipo_id = (l ->> 'tipo_id')::uuid,
           revisao_motivo = (l ->> 'revisao_motivo')::public.revisao_motivo,
           revisao_dados = case when jsonb_typeof(l -> 'revisao_dados') = 'object' then l -> 'revisao_dados' end,
           divisao = case when jsonb_typeof(l -> 'divisao') = 'object' then a.divisao end
      from jsonb_array_elements(dados_lancamentos) as l
     where jsonb_typeof(l -> 'antiga_id') = 'string'
       and a.id = (l ->> 'antiga_id')::uuid
       and a.owner_id = dono
       and a.fatura_id = fatura.id
       and a.excluido_em is null;
    get diagnostics n_pares = row_count;
    if n_pares <> cardinality(r_pares) then
      raise exception 'fatura.mes_mudou';
    end if;

    -- A Divisão que o núcleo desfez (uma parte zeraria): as filhas saem em lógico.
    for rec in
      select a.id as mae_id
        from jsonb_array_elements(dados_lancamentos) as l
        join public.lancamentos as a on a.id = (l ->> 'antiga_id')::uuid and a.owner_id = dono
       where jsonb_typeof(l -> 'antiga_id') = 'string'
         and jsonb_typeof(l -> 'divisao') is distinct from 'object'
         and exists (
           select 1 from public.lancamentos as f
            where f.owner_id = dono and f.dividido_de_id = a.id and f.excluido_em is null
         )
    loop
      perform public.recriar_filhas(rec.mae_id, '[]'::jsonb);
      update public.lancamentos as a set divisao = null where a.id = rec.mae_id;
    end loop;
  end if;

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
      on m.owner_id = dono and m.id = (coalesce(l ->> 'previsto_id', l ->> 'antiga_id'))::uuid
   where (jsonb_typeof(l -> 'previsto_id') = 'string' or jsonb_typeof(l -> 'antiga_id') = 'string')
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
   where jsonb_typeof(l -> 'previsto_id') is distinct from 'string'
     and jsonb_typeof(l -> 'antiga_id') is distinct from 'string';

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
       and jsonb_typeof(l -> 'antiga_id') is distinct from 'string'
       and jsonb_typeof(l -> 'partes') = 'array'
  loop
    perform public.recriar_filhas(rec.mae_id, rec.partes);
  end loop;

  select coalesce(jsonb_agg(to_jsonb(g) order by g.ordem_fatura, g.dividido_de_id nulls first, g.id), '[]'::jsonb) into linhas
    from public.lancamentos as g
   where g.fatura_id = fatura.id;

  -- As linhas que saíram da Fatura (viraram previsto ou `manual`) voltam para a memória.
  if cardinality(ids_destacados) > 0 then
    select coalesce(jsonb_agg(to_jsonb(g) order by g.mes, g.parcela_n nulls last, g.dividido_de_id nulls first, g.id), '[]'::jsonb)
      into destacados
      from public.lancamentos as g
     where g.owner_id = dono and g.id = any (ids_destacados);
  end if;

  return jsonb_build_object(
    'fatura', to_jsonb(fatura),
    'cartoes', cartoes,
    'lancamentos', linhas,
    'previstos', previstos || religados || sem_par || destacados,
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

-- ------------------------------------------------- excluir_linhas_da_conta

create or replace function public.excluir_linhas_da_conta(p_conta_id uuid, p_itens jsonb, p_mes_atual text)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  agora timestamptz := now();
  ids uuid[];
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array'
     or p_mes_atual is null or p_mes_atual !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'salvar.falhou';
  end if;
  if jsonb_array_length(p_itens) = 0 then
    return '{}'::uuid[];
  end if;
  if jsonb_array_length(p_itens) > 5000 then
    raise exception 'salvar.falhou';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_itens) as i
     where jsonb_typeof(i) is distinct from 'object'
        or jsonb_typeof(i -> 'id') is distinct from 'string'
        or jsonb_typeof(i -> 'atualizado_em') is distinct from 'string'
  ) then
    raise exception 'salvar.falhou';
  end if;

  select array_agg((i ->> 'id')::uuid) into ids from jsonb_array_elements(p_itens) as i;
  if (select count(distinct x) from unnest(ids) as x) <> cardinality(ids) then
    raise exception 'salvar.falhou';
  end if;

  -- Trava as linhas (em ordem de id) e vê a versão que ficou.
  perform 1
    from public.lancamentos as l
   where l.owner_id = dono and l.id = any (ids)
   order by l.id
     for update;

  if exists (
    select 1
      from jsonb_array_elements(p_itens) as i
     where not exists (
       select 1
         from public.lancamentos as l
        where l.owner_id = dono
          and l.id = (i ->> 'id')::uuid
          and l.conta_manual_id = p_conta_id
          and l.excluido_em is null
          and l.updated_at = (i ->> 'atualizado_em')::timestamptz
     )
  ) then
    raise exception 'conta.mudou';
  end if;

  -- Linha com Pagamento (Historia 6.9, AD-15) nunca e recriada nem excluida por aqui: o nucleo a deixa
  -- como esta (comPagamento); se um Pagamento entrou depois da leitura, o plano esta velho.
  if exists (
    select 1
      from public.pagamento_itens as i
     where i.owner_id = dono and i.lancamento_id = any (ids) and i.excluido_em is null
  ) then
    raise exception 'conta.mudou';
  end if;

  -- Os Meses anteriores nunca mudam.
  if exists (
    select 1 from public.lancamentos as l where l.owner_id = dono and l.id = any (ids) and l.mes < p_mes_atual
  ) then
    raise exception 'salvar.falhou';
  end if;

  update public.lancamentos as l
     set excluido_em = agora
   where l.owner_id = dono and l.id = any (ids);

  return ids;
end;
$$;
