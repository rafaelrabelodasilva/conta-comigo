-- História 5.4: Alterar, encerrar e excluir uma Conta manual (FR-18, FR-46, AD-1,
-- AD-8, AD-14, AD-15, AD-16).
--
-- Quem decide o que recriar, apagar, criar e deixar como está é o núcleo
-- (src/domain/alterar-conta.ts: `parcelasRecriaveis`, `planoDeAlterarConta`,
-- `planoDeEncerrarConta`, `planoDeExcluirConta`). O SQL só grava o que sai dele
-- e confere segurança: dono, formato, nada antes do Mês atual, e que nada mudou
-- desde a leitura (o `updated_at` de cada linha e da Conta, como o AD-7 faz na
-- importação). Nenhuma regra de "editado à mão" ou "Status pago" mora aqui.
--
-- - `contas_manuais.excluido_em` (AD-16): a Conta é excluída em lógico, nunca
--   apagada. Por isso `series.conta_manual_id` (sem `on delete`) e
--   `lancamentos.conta_manual_id` (`on delete set null`) nunca disparam, a
--   Série e os Lançamentos mantêm a identidade, e o "Desfazer" limpa o campo e
--   devolve os MESMOS ids. Leitores: o cron e a lista filtram `excluido_em is
--   null` (src/server/materializar-contas.ts, src/data/realtime.ts) e o
--   materializador abaixo ignora a Conta excluída. `referencias_cadastro()` e
--   `substituir_cadastro` NÃO filtram: a FK de Tipo e Responsável vale para a
--   Conta excluída também, então excluir um Tipo que só ela cita exige
--   substituto (como os Lançamentos excluídos, que também contam), e a troca
--   chega a ela.
-- - `materializar_contas_manuais`: ganha (1) a trava `for share` da linha da
--   Conta, que espera uma alteração, exclusão ou restauração em andamento
--   (`for update`) e então lê a Conta como ficou; (2) o filtro `excluido_em is
--   null`: parcelas de Conta excluída são ignoradas, sem erro (o cron que leu a
--   Conta um instante antes não recria o que Rafael excluiu); (3) o campo
--   opcional `conta_atualizada_em` por parcela: se a Conta mudou desde que o
--   cron calculou as parcelas, elas são ignoradas (o dia seguinte recalcula).
-- - `salvar_conta_manual`: um `id` de Conta já excluída é recusado
--   (`conta.nao_encontrada`).
-- - `excluir_linhas_da_conta`: interna. Confere e exclui em lógico as linhas
--   (mães e filhas) que o plano mandou.
-- - `alterar_conta_manual(p_pedido)`: Editar e Encerrar (as duas gravam a Conta
--   nova inteira; Encerrar só muda `encerrada_em_mes`). Trava a Conta
--   (`for update`), confere que ela e as linhas não mudaram, exclui as linhas
--   recriáveis, atualiza a Conta e a Série NO LUGAR (a identidade é
--   `conta_manual_id`; a chave do AD-8 muda com Nome, Valor e total, e a
--   `ocorrencia` vem do núcleo) e chama o mesmo `materializar_contas_manuais`
--   (AD-15: um só materializador) com as parcelas a criar.
-- - `excluir_conta_manual(p_pedido)`: exclui a Conta em lógico e, se o plano
--   mandar, as linhas recriáveis dos Meses seguintes. Repetir não faz nada.
-- - `restaurar_conta_manual(p_pedido)`: o "Desfazer" do Excluir.

-- ------------------------------------------------------ contas_manuais.excluido_em

alter table public.contas_manuais add column excluido_em timestamptz;

comment on column public.contas_manuais.excluido_em is
  'Exclusão lógica (AD-16, História 5.4): a Conta excluída não materializa nem aparece na lista. Nulo = viva.';

-- --------------------------------------------- materializar_contas_manuais

-- Igual à da 5.1 (mesma assinatura, mesmos `grant`), com a trava da Conta, o
-- filtro de Conta excluída e a versão opcional da Conta por parcela.
create or replace function public.materializar_contas_manuais(p_ate_mes text, p_parcelas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  status_padrao uuid;
  criados uuid[];
  rec record;
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if p_ate_mes is null or p_ate_mes !~ '^\d{4}-(0[1-9]|1[0-2])$'
     or jsonb_typeof(p_parcelas) is distinct from 'array' then
    raise exception 'salvar.falhou';
  end if;
  if jsonb_array_length(p_parcelas) = 0 then
    return '[]'::jsonb;
  end if;
  if jsonb_array_length(p_parcelas) > 2000 then
    raise exception 'salvar.falhou';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_parcelas) as p
     where jsonb_typeof(p) is distinct from 'object'
        or jsonb_typeof(p -> 'conta_id') is distinct from 'string'
        or jsonb_typeof(p -> 'parcela_n') is distinct from 'number'
        or jsonb_typeof(p -> 'valor_centavos') is distinct from 'number'
        or jsonb_typeof(p -> 'mes') is distinct from 'string'
        or (p ->> 'mes') !~ '^\d{4}-(0[1-9]|1[0-2])$'
        or (p ->> 'mes') > p_ate_mes
        or (p ? 'conta_atualizada_em' and jsonb_typeof(p -> 'conta_atualizada_em') is distinct from 'string')
  ) then
    raise exception 'salvar.falhou';
  end if;

  -- Toda parcela é de uma Conta do dono que já tem Série (excluída ou não: a
  -- Conta excluída é só ignorada mais abaixo, sem erro).
  if exists (
    select 1
      from jsonb_array_elements(p_parcelas) as p
     where not exists (
       select 1
         from public.contas_manuais as c
         join public.series as s on s.owner_id = c.owner_id and s.conta_manual_id = c.id
        where c.owner_id = dono and c.id = (p ->> 'conta_id')::uuid
     )
  ) then
    raise exception 'conta.nao_encontrada';
  end if;

  -- Espera uma alteração, exclusão ou restauração da Conta que esteja em
  -- andamento (elas travam a linha com `for update`) e passa a ver a Conta como
  -- ela ficou. Em ordem de id, para duas chamadas não se travarem.
  perform 1
    from public.contas_manuais as c
   where c.owner_id = dono
     and c.id in (select (p ->> 'conta_id')::uuid from jsonb_array_elements(p_parcelas) as p)
   order by c.id
     for share;

  select c.status_padrao_id into status_padrao
    from public.configuracoes as c
   where c.owner_id = dono;

  -- A restrição única é parcial (linhas-mãe não excluídas): o `on conflict`
  -- precisa repetir o predicado para achá-la.
  with gravados as (
    insert into public.lancamentos (
      nome, nome_normalizado, valor_centavos, parcela_n, parcela_total, mes, lancado_por, status_id,
      responsavel_id, tipo_id, observacao, serie_id, divisao, conta_manual_id
    )
    select
      c.nome,
      s.nome_normalizado,
      (p ->> 'valor_centavos')::integer,
      (p ->> 'parcela_n')::integer,
      c.parcela_total,
      p ->> 'mes',
      'manual'::public.lancado_por,
      status_padrao,
      c.responsavel_id,
      c.tipo_id,
      c.observacao,
      s.id,
      c.divisao,
      c.id
      from jsonb_array_elements(p_parcelas) as p
      join public.contas_manuais as c
        on c.owner_id = dono
       and c.id = (p ->> 'conta_id')::uuid
       -- Conta excluída: nada a criar (o cron pode ter lido a Conta antes da exclusão).
       and c.excluido_em is null
       -- Conta que mudou desde que as parcelas foram calculadas: ignora (o cron recalcula amanhã).
       and (p ->> 'conta_atualizada_em' is null or (p ->> 'conta_atualizada_em')::timestamptz = c.updated_at)
      join public.series as s
        on s.owner_id = dono and s.conta_manual_id = c.id
     order by c.id, (p ->> 'parcela_n')::integer
    on conflict (serie_id, parcela_n) where dividido_de_id is null and excluido_em is null
    do nothing
    returning id
  )
  select coalesce(array_agg(g.id), '{}') into criados from gravados as g;

  -- Com Divisão, as filhas das mães novas (mesmo Valor, então os mesmos
  -- centavos que o núcleo calculou).
  for rec in
    select m.id as mae_id, p -> 'partes' as partes
      from jsonb_array_elements(p_parcelas) as p
      join public.lancamentos as m
        on m.owner_id = dono
       and m.conta_manual_id = (p ->> 'conta_id')::uuid
       and m.parcela_n = (p ->> 'parcela_n')::integer
       and m.dividido_de_id is null
     where m.id = any (criados)
       and jsonb_typeof(p -> 'partes') = 'array'
     order by m.mes, m.id
  loop
    perform public.recriar_filhas(rec.mae_id, rec.partes);
  end loop;

  update public.lancamentos as f
     set conta_manual_id = m.conta_manual_id
    from public.lancamentos as m
   where f.owner_id = dono
     and f.dividido_de_id = m.id
     and m.id = any (criados);

  return coalesce((
    select jsonb_agg(to_jsonb(l) order by l.mes, l.parcela_n, (l.dividido_de_id is not null), l.id)
      from public.lancamentos as l
     where l.owner_id = dono
       and (l.id = any (criados) or l.dividido_de_id = any (criados))
  ), '[]'::jsonb);
end;
$$;

-- ------------------------------------------------------ salvar_conta_manual

-- Igual à da 5.1, mais a recusa de um `id` de Conta já excluída.
create or replace function public.salvar_conta_manual(p_conta jsonb, p_parcelas jsonb, p_ate_mes text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  conta public.contas_manuais;
  criados jsonb;
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if jsonb_typeof(p_conta) is distinct from 'object'
     or jsonb_typeof(p_parcelas) is distinct from 'array'
     or jsonb_typeof(p_conta -> 'id') is distinct from 'string'
     or jsonb_typeof(p_conta -> 'serie') is distinct from 'object' then
    raise exception 'salvar.falhou';
  end if;

  select c.* into conta
    from public.contas_manuais as c
   where c.owner_id = dono and c.id = (p_conta ->> 'id')::uuid;

  if not found then
    insert into public.contas_manuais (
      id, nome, valor_centavos, tipo_id, responsavel_id, observacao, mes_inicial,
      repeticao, parcela_total, divisao
    ) values (
      (p_conta ->> 'id')::uuid,
      p_conta ->> 'nome',
      (p_conta ->> 'valor_centavos')::integer,
      (p_conta ->> 'tipo_id')::uuid,
      (p_conta ->> 'responsavel_id')::uuid,
      p_conta ->> 'observacao',
      p_conta ->> 'mes_inicial',
      p_conta ->> 'repeticao',
      (p_conta ->> 'parcela_total')::integer,
      case when jsonb_typeof(p_conta -> 'divisao') = 'object' then p_conta -> 'divisao' end
    )
    returning * into conta;
  elsif conta.excluido_em is not null then
    -- Repetir o pedido de uma Conta que Rafael já excluiu não a traz de volta.
    raise exception 'conta.nao_encontrada';
  end if;

  if not exists (
    select 1 from public.series as s where s.owner_id = dono and s.conta_manual_id = conta.id
  ) then
    insert into public.series (
      nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia, conta_manual_id
    ) values (
      p_conta -> 'serie' ->> 'nome_normalizado',
      (p_conta -> 'serie' ->> 'parcela_total')::integer,
      (p_conta -> 'serie' ->> 'valor_parcela_centavos')::integer,
      p_conta -> 'serie' ->> 'mes_primeira_parcela',
      (p_conta -> 'serie' ->> 'ocorrencia')::integer,
      conta.id
    );
  end if;

  criados := public.materializar_contas_manuais(p_ate_mes, p_parcelas);

  return jsonb_build_object('conta', to_jsonb(conta), 'lancamentos', criados);
exception
  -- Outra Conta com a mesma chave foi salva entre a leitura da `ocorrencia` e
  -- a gravação (a trava é a chave única da Série).
  when unique_violation then
    if sqlerrm like '%series_chave_key%' or sqlerrm like '%series_conta_chave_key%' then
      raise exception 'conta.serie_ocupada';
    end if;
    raise;
end;
$$;

-- ------------------------------------------------- excluir_linhas_da_conta

-- Interna. `p_itens` = `[{ id, atualizado_em }]`: as linhas (mães e filhas) que o
-- plano do núcleo mandou excluir. Confere que cada uma é da Conta, do dono, não
-- excluída, do Mês atual em diante e INALTERADA desde a leitura (`updated_at`
-- igual): se Rafael pagou ou editou uma delas em outro aparelho, nada é
-- excluído e o chamador recebe `conta.mudou` (a tela relê e recalcula). Exclui
-- em lógico e devolve os ids.
create function public.excluir_linhas_da_conta(p_conta_id uuid, p_itens jsonb, p_mes_atual text)
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

revoke execute on function public.excluir_linhas_da_conta(uuid, jsonb, text) from public, anon;
grant execute on function public.excluir_linhas_da_conta(uuid, jsonb, text) to authenticated;

-- --------------------------------------------------- alterar_conta_manual

-- `p_pedido` = `{ conta, excluir, parcelas, mes_atual, ate_mes }` (o que
-- `planoDeAlterarConta` e `planoDeEncerrarConta` montam). Devolve `{ conta,
-- lancamentos }`: a Conta nova e as linhas que mudaram (as excluídas, já com
-- `excluido_em`, e as criadas: mães e filhas).
create function public.alterar_conta_manual(p_pedido jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  c jsonb := p_pedido -> 'conta';
  conta public.contas_manuais;
  excluidos uuid[];
  criados jsonb;
  excluidas jsonb;
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if jsonb_typeof(p_pedido) is distinct from 'object'
     or jsonb_typeof(c) is distinct from 'object'
     or jsonb_typeof(c -> 'id') is distinct from 'string'
     or jsonb_typeof(c -> 'serie') is distinct from 'object'
     or jsonb_typeof(c -> 'atualizada_em') is distinct from 'string'
     or jsonb_typeof(p_pedido -> 'excluir') is distinct from 'array'
     or jsonb_typeof(p_pedido -> 'parcelas') is distinct from 'array'
     or jsonb_typeof(p_pedido -> 'mes_atual') is distinct from 'string'
     or (p_pedido ->> 'mes_atual') !~ '^\d{4}-(0[1-9]|1[0-2])$'
     or jsonb_typeof(p_pedido -> 'ate_mes') is distinct from 'string'
     or (p_pedido ->> 'ate_mes') !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'salvar.falhou';
  end if;

  -- Trava a Conta: o cron e outra alteração esperam até o commit.
  select t.* into conta
    from public.contas_manuais as t
   where t.owner_id = dono and t.id = (c ->> 'id')::uuid
     for update;
  if not found or conta.excluido_em is not null then
    raise exception 'conta.nao_encontrada';
  end if;
  -- A Conta mudou (em outro aparelho) depois que a tela a leu: nada é gravado.
  if conta.updated_at is distinct from (c ->> 'atualizada_em')::timestamptz then
    raise exception 'conta.mudou';
  end if;
  -- O "Começa em" não muda (a tela o trava; `parcela_n` conta desde ele).
  if conta.mes_inicial is distinct from (c ->> 'mes_inicial') then
    raise exception 'salvar.falhou';
  end if;
  -- As parcelas novas são só desta Conta e só do Mês atual em diante.
  if exists (
    select 1
      from jsonb_array_elements(p_pedido -> 'parcelas') as p
     where (p ->> 'conta_id') is distinct from conta.id::text
        or (p ->> 'mes') < (p_pedido ->> 'mes_atual')
  ) then
    raise exception 'salvar.falhou';
  end if;

  excluidos := public.excluir_linhas_da_conta(conta.id, p_pedido -> 'excluir', p_pedido ->> 'mes_atual');

  update public.contas_manuais as t
     set nome = c ->> 'nome',
         valor_centavos = (c ->> 'valor_centavos')::integer,
         tipo_id = (c ->> 'tipo_id')::uuid,
         responsavel_id = (c ->> 'responsavel_id')::uuid,
         observacao = c ->> 'observacao',
         repeticao = c ->> 'repeticao',
         parcela_total = (c ->> 'parcela_total')::integer,
         divisao = case when jsonb_typeof(c -> 'divisao') = 'object' then c -> 'divisao' end,
         encerrada_em_mes = c ->> 'encerrada_em_mes'
   where t.id = conta.id
  returning t.* into conta;

  -- A Série é a mesma linha (identidade = `conta_manual_id`); só a chave do
  -- AD-8 muda, com a `ocorrencia` que o núcleo escolheu. O `mes_primeira_parcela`
  -- não muda (o "Começa em" é fixo).
  update public.series as s
     set nome_normalizado = c -> 'serie' ->> 'nome_normalizado',
         parcela_total = (c -> 'serie' ->> 'parcela_total')::integer,
         valor_parcela_centavos = (c -> 'serie' ->> 'valor_parcela_centavos')::integer,
         ocorrencia = (c -> 'serie' ->> 'ocorrencia')::integer
   where s.owner_id = dono and s.conta_manual_id = conta.id;
  if not found then
    raise exception 'conta.nao_encontrada';
  end if;

  -- O mesmo materializador (AD-15): cria o que o núcleo mandou; o `on conflict`
  -- protege o que já existe (as parcelas que ficaram como estavam).
  criados := public.materializar_contas_manuais(p_pedido ->> 'ate_mes', p_pedido -> 'parcelas');

  select coalesce(jsonb_agg(to_jsonb(l) order by l.mes, l.parcela_n, (l.dividido_de_id is not null), l.id), '[]'::jsonb)
    into excluidas
    from public.lancamentos as l
   where l.owner_id = dono and l.id = any (excluidos);

  return jsonb_build_object('conta', to_jsonb(conta), 'lancamentos', excluidas || criados);
exception
  -- Outra Conta passou a ocupar a chave nova da Série entre a leitura e a gravação.
  when unique_violation then
    if sqlerrm like '%series_chave_key%' or sqlerrm like '%series_conta_chave_key%' then
      raise exception 'conta.serie_ocupada';
    end if;
    raise;
end;
$$;

revoke execute on function public.alterar_conta_manual(jsonb) from public, anon;
grant execute on function public.alterar_conta_manual(jsonb) to authenticated;

-- ---------------------------------------------------- excluir_conta_manual

-- `p_pedido` = `{ conta_id, excluir, mes_atual }` (`planoDeExcluirConta`).
-- Exclui a Conta em lógico e as linhas que o plano mandou (vazio = só a Conta).
-- Repetir (a Conta já excluída) não faz nada.
create function public.excluir_conta_manual(p_pedido jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  conta public.contas_manuais;
  excluidos uuid[];
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if jsonb_typeof(p_pedido) is distinct from 'object'
     or jsonb_typeof(p_pedido -> 'conta_id') is distinct from 'string'
     or jsonb_typeof(p_pedido -> 'excluir') is distinct from 'array'
     or jsonb_typeof(p_pedido -> 'mes_atual') is distinct from 'string' then
    raise exception 'salvar.falhou';
  end if;

  select t.* into conta
    from public.contas_manuais as t
   where t.owner_id = dono and t.id = (p_pedido ->> 'conta_id')::uuid
     for update;
  if not found then
    raise exception 'conta.nao_encontrada';
  end if;
  if conta.excluido_em is not null then
    return jsonb_build_object('conta', to_jsonb(conta), 'lancamentos', '[]'::jsonb);
  end if;

  excluidos := public.excluir_linhas_da_conta(conta.id, p_pedido -> 'excluir', p_pedido ->> 'mes_atual');

  update public.contas_manuais as t set excluido_em = now() where t.id = conta.id returning t.* into conta;

  return jsonb_build_object(
    'conta', to_jsonb(conta),
    'lancamentos', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.mes, l.parcela_n, (l.dividido_de_id is not null), l.id)
        from public.lancamentos as l
       where l.owner_id = dono and l.id = any (excluidos)
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.excluir_conta_manual(jsonb) from public, anon;
grant execute on function public.excluir_conta_manual(jsonb) to authenticated;

-- -------------------------------------------------- restaurar_conta_manual

-- `p_pedido` = `{ conta_id, ids }`: o "Desfazer" do Excluir (AD-16). Limpa
-- `excluido_em` na Conta e nas linhas dela que estavam excluídas e foram
-- listadas (os MESMOS ids, nunca linhas novas). Repetir não faz nada.
create function public.restaurar_conta_manual(p_pedido jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  conta public.contas_manuais;
  ids uuid[];
  restauradas jsonb;
  conta_id uuid;
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if jsonb_typeof(p_pedido) is distinct from 'object'
     or jsonb_typeof(p_pedido -> 'conta_id') is distinct from 'string'
     or jsonb_typeof(p_pedido -> 'ids') is distinct from 'array'
     or exists (
       select 1 from jsonb_array_elements(p_pedido -> 'ids') as i where jsonb_typeof(i) is distinct from 'string'
     ) then
    raise exception 'salvar.falhou';
  end if;
  select coalesce(array_agg((i #>> '{}')::uuid), '{}') into ids from jsonb_array_elements(p_pedido -> 'ids') as i;
  conta_id := (p_pedido ->> 'conta_id')::uuid;

  perform 1
    from public.contas_manuais as t
   where t.owner_id = dono and t.id = conta_id
     for update;
  if not found then
    raise exception 'conta.nao_encontrada';
  end if;

  -- Só mexe (e só gera evento) se ela ainda está excluída: repetir não faz nada.
  update public.contas_manuais as t set excluido_em = null where t.id = conta_id and t.excluido_em is not null;
  select t.* into conta from public.contas_manuais as t where t.id = conta_id;

  with voltaram as (
    update public.lancamentos as l
       set excluido_em = null
     where l.owner_id = dono
       and l.conta_manual_id = conta.id
       and l.excluido_em is not null
       and l.id = any (ids)
    returning l.*
  )
  select coalesce(jsonb_agg(to_jsonb(v) order by v.mes, v.parcela_n, (v.dividido_de_id is not null), v.id), '[]'::jsonb)
    into restauradas
    from voltaram as v;

  return jsonb_build_object('conta', to_jsonb(conta), 'lancamentos', restauradas);
end;
$$;

revoke execute on function public.restaurar_conta_manual(jsonb) from public, anon;
grant execute on function public.restaurar_conta_manual(jsonb) to authenticated;
