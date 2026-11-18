-- História 6.6: Dívida programada (FR-27, UX-DR19, AD-8, AD-10, AD-14, AD-15).
--
-- A Dívida programada é uma data combinada no próprio Lançamento (AD-10):
--   - `lancamentos.vencimento_combinado` (date, anulável): quando existe, é o vencimento
--     do Lançamento (manda sobre o da Fatura e o do Ciclo, `vencimentoDoLancamento` do
--     núcleo) e a mensagem de cobrança o deixa de fora até o Mês desse vencimento.
--   - `lancamentos.vencimento_observacao` (text, anulável): a observação opcional da janela
--     "Programar dívida" ("combinado por WhatsApp"). Coluna própria, e não `observacao`,
--     porque a Observação da filha de uma Divisão segue a da mãe (`recriar_filhas` a copia)
--     e porque a nota do combinado é desta parte e tem de sobreviver a "Dividir" de novo.
--     Só existe com a data (restrição).
-- Quem calcula o que isso significa (programada, atrasada, fora da mensagem, "A receber")
-- é o núcleo (src/domain/divida.ts, atraso.ts, projecoes.ts); o SQL só guarda.
--
-- - `recriar_filhas(mae, partes)`: a única RPC existente que precisa mudar. Uma parte pode
--   trazer `vencimento_combinado` (string `AAAA-MM-DD` ou nulo). Chave presente grava na
--   filha (nula limpa também a observação do combinado); chave ausente MANTÉM o que a filha
--   já tem (como `status_id`), então "Dividir" de novo não perde a Dívida programada.
--   A filha nova nasce com a data da parte (ou sem). É por aqui que a Conta manual com uma
--   parte "Dívida programada" materializa as filhas com o vencimento (AD-15):
--   `materializar_contas_manuais`, `salvar_conta_manual` e `alterar_conta_manual` já chamam
--   `recriar_filhas` com as partes que o núcleo calculou e não mudam.
-- - `programar_divida(p_itens)`: nova. Tudo ou nada. Cada item é `{ id, vencimento_combinado,
--   vencimento_observacao, editado_em? }`: data nula desliga a Dívida programada (e a nota).
--   Recusa Lançamento inexistente, de outro dono ou excluído e a mãe dividida (a Dívida é
--   das partes; o núcleo troca a mãe pelas filhas antes). Com `editado_em`, marca a linha
--   e a mãe dela (se é filha) como mexidas à mão: a reimportação e "Alterar conta" as
--   preservam como fazem com qualquer edição (FR-51, AD-15). Devolve as linhas gravadas.
--
-- Não mudam (conferido): `importar_fatura` (a casada é atualizada no mesmo `id` com colunas
-- nomeadas, que não incluem estas duas; a linha nova nasce sem Dívida), `dividir_lancamento`
-- (só chama `recriar_filhas`), `materializar_contas_manuais_do_dono` (idem),
-- `aplicar_pagamento` e `desfazer_pagamento` (só Status e itens), `classificar_em_lote`,
-- `importar_aba_planilha`, `substituir_cadastro` e `referencias_cadastro`.

-- ------------------------------------------------------------------ colunas

alter table public.lancamentos
  add column vencimento_combinado date,
  add column vencimento_observacao text,
  add constraint lancamentos_vencimento_combinado_check
    check (vencimento_combinado is null or vencimento_combinado between date '2000-01-01' and date '2099-12-31'),
  add constraint lancamentos_vencimento_observacao_check
    check (
      vencimento_observacao is null
      or (vencimento_combinado is not null and char_length(vencimento_observacao) between 1 and 500)
    );

comment on column public.lancamentos.vencimento_combinado is
  'Dívida programada (História 6.6, FR-27): a data combinada para cobrar este Lançamento (AAAA-MM-DD). Quando existe, é o vencimento dele (atraso e mensagem). Nulo = vale o da Fatura ou o do Ciclo.';

comment on column public.lancamentos.vencimento_observacao is
  'Observação opcional do combinado da Dívida programada (até 500). Só existe com vencimento_combinado.';

-- ----------------------------------------------------------- recriar_filhas

-- Igual à da 3.8 (mesma assinatura e mesmos `grant`), com `vencimento_combinado` por parte.
create or replace function public.recriar_filhas(p_mae_id uuid, p_partes jsonb)
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
  vence date;
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
       or jsonb_typeof(parte -> 'valor_centavos') is distinct from 'number'
       or (parte ? 'vencimento_combinado'
           and jsonb_typeof(parte -> 'vencimento_combinado') not in ('string', 'null')) then
      raise exception 'salvar.falhou';
    end if;
    filha := case when jsonb_typeof(parte -> 'filha_id') = 'string' then (parte ->> 'filha_id')::uuid end;
    vence := (parte ->> 'vencimento_combinado')::date;
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
             vencimento_combinado = case when parte ? 'vencimento_combinado' then vence else f.vencimento_combinado end,
             vencimento_observacao = case
               when parte ? 'vencimento_combinado' and vence is null then null
               else f.vencimento_observacao end,
             excluido_em = null
       where f.id = filha and f.owner_id = dono and f.dividido_de_id = mae.id;
      if not found then
        raise exception 'divisao.filha_invalida';
      end if;
    else
      insert into public.lancamentos (
        nome, nome_normalizado, apelido, valor_centavos, data, parcela_n, parcela_total,
        final_cartao, mes, fatura_id, ordem_fatura, lancado_por, status_id,
        responsavel_id, tipo_id, observacao, serie_id, origem_lancamento_id, dividido_de_id,
        vencimento_combinado
      ) values (
        mae.nome, mae.nome_normalizado, mae.apelido, (parte ->> 'valor_centavos')::integer, mae.data,
        mae.parcela_n, mae.parcela_total, mae.final_cartao, mae.mes, mae.fatura_id, mae.ordem_fatura,
        mae.lancado_por,
        case when parte ? 'status_id' then (parte ->> 'status_id')::uuid else mae.status_id end,
        (parte ->> 'responsavel_id')::uuid, mae.tipo_id, mae.observacao, mae.serie_id,
        mae.origem_lancamento_id, mae.id,
        vence
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

-- ---------------------------------------------------------- programar_divida

create function public.programar_divida(p_itens jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  colunas constant text[] := array['id', 'vencimento_combinado', 'vencimento_observacao', 'editado_em'];
  item jsonb;
  linha public.lancamentos;
  tocadas uuid[] := '{}';
  vistos uuid[] := '{}';
  vence date;
  nota text;
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
       or not (item ? 'vencimento_combinado')
       or jsonb_typeof(item -> 'vencimento_combinado') not in ('string', 'null')
       or (item ? 'vencimento_observacao' and jsonb_typeof(item -> 'vencimento_observacao') not in ('string', 'null'))
       or (item ? 'editado_em' and jsonb_typeof(item -> 'editado_em') not in ('string', 'null'))
       or exists (select 1 from jsonb_object_keys(item) as k where k <> all (colunas)) then
      raise exception 'salvar.falhou';
    end if;
    if (item ->> 'id')::uuid = any (vistos) then
      raise exception 'salvar.falhou';
    end if;
    vistos := vistos || (item ->> 'id')::uuid;
    vence := (item ->> 'vencimento_combinado')::date;
    nota := item ->> 'vencimento_observacao';
    if vence is null and nota is not null then
      raise exception 'salvar.falhou';
    end if;

    select * into linha
      from public.lancamentos as l
     where l.id = (item ->> 'id')::uuid and l.owner_id = dono and l.excluido_em is null
       for update;
    if not found then
      raise exception 'programada.nao_encontrada';
    end if;
    -- A Dívida é de cada parte (AD-8): a mãe dividida nunca é programada.
    if linha.dividido_de_id is null and linha.divisao is not null then
      raise exception 'programada.mae_dividida';
    end if;

    update public.lancamentos as l
       set vencimento_combinado = vence,
           vencimento_observacao = nota,
           editado_em = case when item ? 'editado_em' then (item ->> 'editado_em')::timestamptz else l.editado_em end
     where l.id = linha.id;
    tocadas := tocadas || linha.id;

    -- A filha mexida marca a mãe: a reimportação e "Alterar conta" a mantêm com as filhas.
    if linha.dividido_de_id is not null and (item ->> 'editado_em') is not null then
      update public.lancamentos as m
         set editado_em = coalesce(m.editado_em, (item ->> 'editado_em')::timestamptz)
       where m.id = linha.dividido_de_id and m.owner_id = dono and m.editado_em is null;
      if found then
        tocadas := tocadas || linha.dividido_de_id;
      end if;
    end if;
  end loop;

  return coalesce((
    select jsonb_agg(to_jsonb(l) order by l.mes, l.ordem_fatura nulls last, (l.dividido_de_id is not null), l.id)
      from public.lancamentos as l
     where l.owner_id = dono and l.id = any (tocadas)
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.programar_divida(jsonb) from public, anon;
grant execute on function public.programar_divida(jsonb) to authenticated;
