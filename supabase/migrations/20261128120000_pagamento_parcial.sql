-- História 6.2: Pagamento parcial e "a minha parte" (FR-25, AD-1, AD-2, AD-10, AD-14, AD-16).
--
-- Quem decide o que o Pagamento quita continua sendo o núcleo (src/domain/pagamento.ts:
-- `alocarPagamento`, `planejarPagamento`, `planejarDesfazerPagamento`). O SQL só grava
-- e confere segurança. O `check` de `pagamentos.modo` já aceita os três modos desde a 6.1,
-- então não há tabela nova; o que muda é:
--
-- - `pagamento_itens.status_aplicado_id` passa a aceitar nulo. Nulo é o item PARCIAL
--   ("Fica pendente": o valor recebido só cobriu parte da linha): o Pagamento não mudou
--   o Status da linha, que segue com o Status que tinha. Desfazer não tem o que devolver
--   nele. A FK e a contagem de uso do Status não mudam (nulo não cita ninguém).
-- - `lancamentos_recusar_status_nao_pago` (AD-10) passa a olhar só a troca de um Status
--   PAGO por um não pago numa linha que um Pagamento quitou (item vivo com Status aplicado).
--   Antes recusava qualquer troca para "não pago" numa linha com item, o que impediria
--   trocar "Não pago" por "Em análise" numa linha parcialmente paga. Como desfazer o
--   Pagamento que fecha o valor de uma linha com item parcial de outro Pagamento devolve
--   a linha a "não pago" sem o item parcial dele, a regra também não pode olhar o item
--   parcial.
-- - `aplicar_pagamento` aceita `total`, `parcial` e `minha_parte` (mesma assinatura e
--   mesmos `grant`). Cada item do pedido leva `quita`: true quita o restante da linha
--   (a linha recebe o Status aplicado); false é o item parcial (0 < item < restante, a
--   linha mantém o Status). O que a RPC confere por modo:
--     total:       todos `quita`, Σ itens = valor recebido;
--     parcial:     Σ itens = valor recebido, no máximo um item parcial;
--     minha_parte: todos `quita`, Σ itens > valor recebido (o que sobra é a parte de quem
--                  cobra; nenhum item é zero e cada item é o restante inteiro da linha, que
--                  é o que desfazer precisa para devolver o Status).
--   Em todos: dono, formato, linha viva e INALTERADA desde a leitura (`updated_at`),
--   nenhuma mãe dividida, nenhuma linha já paga, nenhum item zero, `quita` ⇔ item = restante.
--   Toda linha tocada (inclusive a do item parcial, que não muda de Status) tem o
--   `updated_at` movido: é a trava de outro aparelho e o evento do Realtime.
-- - `desfazer_pagamento`: igual à da 6.1, mais o movimento do `updated_at` das linhas que
--   só tinham item parcial (o Status não muda, a versão anda).

-- ------------------------------------------------ status_aplicado_id anulável

alter table public.pagamento_itens alter column status_aplicado_id drop not null;

comment on column public.pagamento_itens.status_aplicado_id is
  'O Status que o Pagamento aplicou à linha. Nulo no item parcial (6.2): o Pagamento não mudou o Status.';

-- ------------------------------- Status "não pago" à mão numa linha quitada

create or replace function public.recusar_status_nao_pago_com_pagamento()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Só tirar o "pago" de uma linha que um Pagamento quitou (item vivo que aplicou Status).
  if exists (
       select 1
         from public.status as s
        where s.owner_id = new.owner_id and s.id = old.status_id and s.conta_como_pago
     )
     and exists (
       select 1
         from public.pagamento_itens as i
        where i.owner_id = new.owner_id and i.lancamento_id = new.id
          and i.excluido_em is null and i.status_aplicado_id is not null
     )
     and not exists (
       select 1
         from public.status as s
        where s.owner_id = new.owner_id and s.id = new.status_id and s.conta_como_pago
     ) then
    raise exception 'pagamento.desfazer_antes';
  end if;
  return new;
end;
$$;

-- --------------------------------------------------------- aplicar_pagamento

-- `p_pedido` = `{ id, status_id, data, valor_recebido_centavos, modo, itens }`, com
-- `itens` = `[{ lancamento_id, valor_centavos, atualizado_em, quita }]` (o que
-- `planejarPagamento` monta). Devolve `{ pagamento, itens, lancamentos }`.
--
-- Erros: `pagamento.status_invalido` (o Status não existe, está arquivado ou não conta
-- como pago), `pagamento.mudou` (alguma linha mudou ou foi excluída desde que a tela a
-- leu), `pagamento.ja_desfeito` (repetir o pedido de um Pagamento que já foi desfeito)
-- e `salvar.falhou` (formato, soma, modo ou item fora do restante).
create or replace function public.aplicar_pagamento(p_pedido jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  pg_id uuid;
  aplicado uuid;
  dia date;
  valor integer;
  modo_do_pagamento text;
  ids uuid[];
  quitam uuid[];
  n_itens integer;
  n_parciais integer;
  soma integer;
  inserido uuid;
  existente public.pagamentos;
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if jsonb_typeof(p_pedido) is distinct from 'object'
     or jsonb_typeof(p_pedido -> 'id') is distinct from 'string'
     or (p_pedido ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_pedido -> 'status_id') is distinct from 'string'
     or (p_pedido ->> 'status_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_pedido -> 'data') is distinct from 'string'
     or (p_pedido ->> 'data') !~ '^\d{4}-\d{2}-\d{2}$'
     or jsonb_typeof(p_pedido -> 'valor_recebido_centavos') is distinct from 'number'
     or (p_pedido ->> 'valor_recebido_centavos') !~ '^\d{1,10}$'
     or jsonb_typeof(p_pedido -> 'modo') is distinct from 'string'
     or (p_pedido ->> 'modo') not in ('total', 'parcial', 'minha_parte')
     or jsonb_typeof(p_pedido -> 'itens') is distinct from 'array' then
    raise exception 'salvar.falhou';
  end if;
  modo_do_pagamento := p_pedido ->> 'modo';
  n_itens := jsonb_array_length(p_pedido -> 'itens');
  if n_itens < 1 or n_itens > 1000 then
    raise exception 'salvar.falhou';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_pedido -> 'itens') as i
     where jsonb_typeof(i) is distinct from 'object'
        or jsonb_typeof(i -> 'lancamento_id') is distinct from 'string'
        or (i ->> 'lancamento_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or jsonb_typeof(i -> 'valor_centavos') is distinct from 'number'
        or (i ->> 'valor_centavos') !~ '^-?\d{1,10}$'
        or jsonb_typeof(i -> 'atualizado_em') is distinct from 'string'
        or (i ->> 'atualizado_em') !~ '^\d{4}-\d{2}-\d{2}[T ]'
        or jsonb_typeof(i -> 'quita') is distinct from 'boolean'
  ) then
    raise exception 'salvar.falhou';
  end if;

  begin
    pg_id := (p_pedido ->> 'id')::uuid;
    aplicado := (p_pedido ->> 'status_id')::uuid;
    dia := (p_pedido ->> 'data')::date;
    valor := (p_pedido ->> 'valor_recebido_centavos')::integer;
    select array_agg((i ->> 'lancamento_id')::uuid) into ids from jsonb_array_elements(p_pedido -> 'itens') as i;
    select coalesce(array_agg((i ->> 'lancamento_id')::uuid), '{}') into quitam
      from jsonb_array_elements(p_pedido -> 'itens') as i
     where (i ->> 'quita')::boolean;
    select sum((i ->> 'valor_centavos')::integer) into soma from jsonb_array_elements(p_pedido -> 'itens') as i;
    perform (i ->> 'atualizado_em')::timestamptz from jsonb_array_elements(p_pedido -> 'itens') as i;
  exception
    when invalid_text_representation or datetime_field_overflow or invalid_datetime_format
         or numeric_value_out_of_range or invalid_parameter_value then
      raise exception 'salvar.falhou';
  end;
  if (select count(distinct x) from unnest(ids) as x) <> cardinality(ids) then
    raise exception 'salvar.falhou';
  end if;
  if valor <= 0 then
    raise exception 'salvar.falhou';
  end if;
  n_parciais := n_itens - cardinality(quitam);
  -- O que cada modo exige da soma e dos itens parciais.
  if modo_do_pagamento = 'total' and (n_parciais <> 0 or soma is distinct from valor) then
    raise exception 'salvar.falhou';
  end if;
  if modo_do_pagamento = 'parcial' and (n_parciais > 1 or soma is distinct from valor) then
    raise exception 'salvar.falhou';
  end if;
  if modo_do_pagamento = 'minha_parte' and (n_parciais <> 0 or soma is null or soma <= valor) then
    raise exception 'salvar.falhou';
  end if;

  -- O Pagamento nasce primeiro: o mesmo `id` repetido (duplo toque, resposta
  -- perdida, ou dois aparelhos ao mesmo tempo) espera o primeiro terminar e
  -- recebe o mesmo resultado, sem gravar de novo.
  insert into public.pagamentos (id, valor_recebido_centavos, data, modo)
  values (pg_id, valor, dia, modo_do_pagamento)
  on conflict (id) do nothing
  returning id into inserido;
  if inserido is null then
    select p.* into existente from public.pagamentos as p where p.owner_id = dono and p.id = pg_id;
    if not found then
      raise exception 'salvar.falhou';
    end if;
    if existente.excluido_em is not null then
      raise exception 'pagamento.ja_desfeito';
    end if;
    return public.pagamento_completo(pg_id);
  end if;

  if not exists (
    select 1
      from public.status as s
     where s.owner_id = dono and s.id = aplicado and s.conta_como_pago and not s.arquivado
  ) then
    raise exception 'pagamento.status_invalido';
  end if;

  -- Trava as linhas (em ordem de id) e vê a versão que ficou.
  perform 1
    from public.lancamentos as l
   where l.owner_id = dono and l.id = any (ids)
   order by l.id
     for update;

  -- Cada linha existe, está viva e NÃO mudou desde a leitura (Valor, Status,
  -- exclusão, outro Pagamento: tudo move o `updated_at`).
  if exists (
    select 1
      from jsonb_array_elements(p_pedido -> 'itens') as i
     where not exists (
       select 1
         from public.lancamentos as l
        where l.owner_id = dono
          and l.id = (i ->> 'lancamento_id')::uuid
          and l.excluido_em is null
          and l.updated_at = (i ->> 'atualizado_em')::timestamptz
     )
  ) then
    raise exception 'pagamento.mudou';
  end if;

  -- Nenhuma linha é mãe dividida (AD-8: a Divisão é paga pelas partes), nenhuma já
  -- conta como paga, nenhum item é zero e cada item bate com o restante da linha
  -- (valor menos o que os itens vivos já quitaram): `quita` é o restante inteiro; o
  -- item parcial é maior que zero e menor que o restante (e a linha tem de dever).
  if exists (
    select 1
      from jsonb_array_elements(p_pedido -> 'itens') as i
      join public.lancamentos as l
        on l.owner_id = dono and l.id = (i ->> 'lancamento_id')::uuid
      cross join lateral (
        select l.valor_centavos - coalesce((
          select sum(pi.valor_centavos)
            from public.pagamento_itens as pi
           where pi.owner_id = dono and pi.lancamento_id = l.id and pi.excluido_em is null
        ), 0) as restante
      ) as r
     where (l.divisao is not null and l.dividido_de_id is null)
        or exists (
          select 1 from public.status as s
           where s.owner_id = dono and s.id = l.status_id and s.conta_como_pago
        )
        or (i ->> 'valor_centavos')::integer = 0
        or case
             when (i ->> 'quita')::boolean then (i ->> 'valor_centavos')::integer <> r.restante
             else not (r.restante > 0 and (i ->> 'valor_centavos')::integer > 0 and (i ->> 'valor_centavos')::integer < r.restante)
           end
  ) then
    raise exception 'salvar.falhou';
  end if;

  -- O item parcial não aplica Status (nulo); o anterior é o que a linha tem agora.
  insert into public.pagamento_itens (
    pagamento_id, lancamento_id, mes, valor_centavos, status_anterior_id, status_aplicado_id
  )
  select pg_id, l.id, l.mes, (i ->> 'valor_centavos')::integer, l.status_id,
         case when (i ->> 'quita')::boolean then aplicado else null end
    from jsonb_array_elements(p_pedido -> 'itens') as i
    join public.lancamentos as l
      on l.owner_id = dono and l.id = (i ->> 'lancamento_id')::uuid
   order by l.mes, l.id;

  -- As linhas quitadas recebem o Status aplicado; as do item parcial ficam com o que
  -- tinham (o valor da coluna é o mesmo, e o gatilho de updated_at move a versão delas).
  update public.lancamentos as l
     set status_id = case when l.id = any (quitam) then aplicado else l.status_id end
   where l.owner_id = dono and l.id = any (ids);

  return public.pagamento_completo(pg_id);
end;
$$;

revoke execute on function public.aplicar_pagamento(jsonb) from public, anon;
grant execute on function public.aplicar_pagamento(jsonb) to authenticated;

-- ------------------------------------------------------- desfazer_pagamento

-- `p_pedido` = `{ pagamento_id, devolver }`, com `devolver` =
-- `[{ lancamento_id, status_id, atualizado_em }]` (`planejarDesfazerPagamento`): as
-- linhas que recebem de volta o Status anterior. Exclui o Pagamento e os itens em
-- lógico; as demais linhas ficam como estão (a do item parcial só tem a versão movida).
-- Repetir (já desfeito) não faz nada. Devolve `{ pagamento, itens, lancamentos }`.
create or replace function public.desfazer_pagamento(p_pedido jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  pg_id uuid;
  agora timestamptz := now();
  existente public.pagamentos;
  ids uuid[];
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if jsonb_typeof(p_pedido) is distinct from 'object'
     or jsonb_typeof(p_pedido -> 'pagamento_id') is distinct from 'string'
     or (p_pedido ->> 'pagamento_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_pedido -> 'devolver') is distinct from 'array'
     or jsonb_array_length(p_pedido -> 'devolver') > 1000 then
    raise exception 'salvar.falhou';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_pedido -> 'devolver') as d
     where jsonb_typeof(d) is distinct from 'object'
        or jsonb_typeof(d -> 'lancamento_id') is distinct from 'string'
        or (d ->> 'lancamento_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or jsonb_typeof(d -> 'status_id') not in ('string', 'null')
        or (jsonb_typeof(d -> 'status_id') = 'string'
            and (d ->> 'status_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        or jsonb_typeof(d -> 'atualizado_em') is distinct from 'string'
        or (d ->> 'atualizado_em') !~ '^\d{4}-\d{2}-\d{2}[T ]'
  ) then
    raise exception 'salvar.falhou';
  end if;
  pg_id := (p_pedido ->> 'pagamento_id')::uuid;
  select coalesce(array_agg((d ->> 'lancamento_id')::uuid), '{}') into ids
    from jsonb_array_elements(p_pedido -> 'devolver') as d;
  if (select count(distinct x) from unnest(ids) as x) <> cardinality(ids) then
    raise exception 'salvar.falhou';
  end if;

  select p.* into existente
    from public.pagamentos as p
   where p.owner_id = dono and p.id = pg_id
     for update;
  if not found then
    raise exception 'pagamento.nao_encontrado';
  end if;
  -- Já desfeito: repetir não faz nada.
  if existente.excluido_em is not null then
    return public.pagamento_completo(pg_id);
  end if;

  -- Trava as linhas (em ordem de id) e confere o que a tela leu: cada uma é item
  -- vivo deste Pagamento, o Status atual ainda é o aplicado, o que volta é o
  -- anterior e a linha não mudou desde a leitura.
  perform 1
    from public.lancamentos as l
   where l.owner_id = dono and l.id = any (ids)
   order by l.id
     for update;
  if exists (
    select 1
      from jsonb_array_elements(p_pedido -> 'devolver') as d
     where not exists (
       select 1
         from public.pagamento_itens as i
         join public.lancamentos as l on l.owner_id = i.owner_id and l.id = i.lancamento_id
        where i.owner_id = dono
          and i.pagamento_id = pg_id
          and i.excluido_em is null
          and i.lancamento_id = (d ->> 'lancamento_id')::uuid
          and i.status_anterior_id is not distinct from (d ->> 'status_id')::uuid
          and l.status_id = i.status_aplicado_id
          and l.updated_at = (d ->> 'atualizado_em')::timestamptz
     )
  ) then
    raise exception 'pagamento.mudou';
  end if;

  -- Os itens saem primeiro: o gatilho do Status "não pago" só olha itens vivos.
  update public.pagamentos as p set excluido_em = agora where p.owner_id = dono and p.id = pg_id;
  update public.pagamento_itens as i
     set excluido_em = agora
   where i.owner_id = dono and i.pagamento_id = pg_id and i.excluido_em is null;

  update public.lancamentos as l
     set status_id = i.status_anterior_id
    from public.pagamento_itens as i
   where l.owner_id = dono
     and l.id = any (ids)
     and i.owner_id = dono
     and i.pagamento_id = pg_id
     and i.lancamento_id = l.id;

  -- As linhas que só tinham item parcial (ou cujo Status mudou à mão) não mudam de
  -- Status, mas a versão delas anda: o restante delas mudou para os outros aparelhos.
  update public.lancamentos as l
     set status_id = l.status_id
   where l.owner_id = dono
     and not (l.id = any (ids))
     and l.id in (
       select i.lancamento_id
         from public.pagamento_itens as i
        where i.owner_id = dono and i.pagamento_id = pg_id
     );

  return public.pagamento_completo(pg_id);
end;
$$;

revoke execute on function public.desfazer_pagamento(jsonb) from public, anon;
grant execute on function public.desfazer_pagamento(jsonb) to authenticated;
