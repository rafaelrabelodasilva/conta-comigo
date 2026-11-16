-- História 6.1: Marcar como pago (FR-25, AD-1, AD-2, AD-4, AD-8, AD-10, AD-14, AD-16).
--
-- Quem decide o que o Pagamento quita é o núcleo (src/domain/pagamento.ts:
-- `projetarPagamento`, `alocarPagamento`, `planejarPagamento`,
-- `planejarDesfazerPagamento`). O SQL só grava o que sai dele e confere
-- segurança: dono, formato, soma dos itens = valor recebido, nenhum item acima
-- do restante, Lançamento vivo e INALTERADO desde a leitura (`updated_at`, como
-- a importação do AD-7 e a 5.4). Nenhuma regra de "pode pagar" mora aqui.
--
-- - `pagamentos` (AD-10): `valor_recebido_centavos`, `data` (dia em que o dinheiro
--   entrou), `modo` (`total`, `parcial`, `minha_parte`; a RPC desta história só
--   grava `total`) e `excluido_em` (AD-16: desfazer exclui em lógico). Sem
--   política de DELETE: nada apaga um Pagamento.
-- - `pagamento_itens`: quanto de cada Lançamento o Pagamento quitou, com o Status
--   de antes e o aplicado. `mes` é o Mês do Lançamento (AD-9, fixado na criação e
--   nunca recalculado), copiado aqui para o gerenciador do Realtime ler só o Mês
--   aberto (AD-4). `excluido_em` acompanha o Pagamento desfeito: o item de um
--   Pagamento desfeito não conta (AD-10) e o outro aparelho recebe o evento.
--   Todo item é de uma linha que nunca é a mãe dividida (AD-8).
-- - `referencias_cadastro()`: o Status em `pagamento_itens` é citado (FK). O
--   aplicado conta uso (excluir um Status que quitou Pagamentos exige
--   substituto); o anterior não (sem substituto vira nulo, que vale "não pago").
-- - `lancamentos_recusar_status_nao_pago` (AD-10): trocar o Status de uma linha
--   que tem item de Pagamento (não excluído) por um que não conta como pago é
--   recusado (`pagamento.desfazer_antes`), por qualquer caminho: gravação simples,
--   `classificar_em_lote`, `substituir_cadastro`. A tela confere antes (núcleo
--   `recusarStatusNaoPago`); o gatilho cobre outro aparelho e uma tela velha.
-- - `aplicar_pagamento(p_pedido)`: grava o Pagamento, os itens e o Status das
--   linhas numa transação. O `id` do Pagamento vem da tela: repetir o pedido
--   (duplo toque, resposta perdida) devolve o mesmo Pagamento sem gravar de novo.
--   Nada supõe um Mês: as linhas podem ser de Meses diferentes.
-- - `desfazer_pagamento(p_pedido)`: exclui o Pagamento e os itens em lógico e
--   devolve o Status anterior só nas linhas que o núcleo mandou (o Status atual
--   ainda é o aplicado e nenhum Pagamento posterior tocou, AD-10). A tela do
--   histórico e o teste de dois Pagamentos fora de ordem são da História 6.3.
-- - `pagamento_completo(p_id)`: interna. `{ pagamento, itens, lancamentos }`,
--   o que as duas RPCs devolvem para o gerenciador aplicar (AD-4).

-- ---------------------------------------------------------------- pagamentos

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  valor_recebido_centavos integer not null,
  data date not null,
  modo text not null,
  excluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pagamentos_valor_check check (valor_recebido_centavos > 0),
  constraint pagamentos_modo_check check (modo in ('total', 'parcial', 'minha_parte')),
  -- Alvo da chave composta de `pagamento_itens`.
  constraint pagamentos_owner_id_id_key unique (owner_id, id)
);

comment on table public.pagamentos is
  'Pagamento (Glossário, AD-10): o que Rafael recebeu e aplicou a Lançamentos. Excluído em lógico ao desfazer (AD-16).';
comment on column public.pagamentos.data is
  'O dia em que o dinheiro entrou (America/Sao_Paulo), escolhido na janela Aplicar status.';
comment on column public.pagamentos.modo is
  'total: valor recebido = total dos itens. parcial e minha_parte: História 6.2.';

create index pagamentos_owner_id_data_idx on public.pagamentos (owner_id, data);

create trigger pagamentos_definir_updated_at
  before insert or update on public.pagamentos
  for each row execute function public.definir_updated_at();

alter table public.pagamentos enable row level security;

create policy "pagamentos_select_dono" on public.pagamentos
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "pagamentos_insert_dono" on public.pagamentos
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "pagamentos_update_dono" on public.pagamentos
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter table public.pagamentos replica identity full;
alter publication supabase_realtime add table public.pagamentos;

-- ---------------------------------------------------------- pagamento_itens

create table public.pagamento_itens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  pagamento_id uuid not null,
  lancamento_id uuid not null,
  -- O Mês do Lançamento (AD-9: fixo desde a criação), para o Realtime ler só o Mês aberto.
  mes text not null,
  -- Quanto do Lançamento este Pagamento quitou (negativo é crédito; nunca zero).
  valor_centavos integer not null,
  status_anterior_id uuid,
  status_aplicado_id uuid not null,
  excluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pagamento_itens_mes_check check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint pagamento_itens_valor_check check (valor_centavos <> 0),
  constraint pagamento_itens_owner_id_id_key unique (owner_id, id),
  constraint pagamento_itens_pagamento_fkey
    foreign key (owner_id, pagamento_id)
    references public.pagamentos (owner_id, id),
  constraint pagamento_itens_lancamento_fkey
    foreign key (owner_id, lancamento_id)
    references public.lancamentos (owner_id, id),
  constraint pagamento_itens_status_anterior_fkey
    foreign key (owner_id, status_anterior_id)
    references public.status (owner_id, id),
  constraint pagamento_itens_status_aplicado_fkey
    foreign key (owner_id, status_aplicado_id)
    references public.status (owner_id, id)
);

comment on table public.pagamento_itens is
  'Quanto de cada Lançamento um Pagamento quitou, com o Status de antes e o aplicado (AD-10). Excluído junto com o Pagamento.';
comment on column public.pagamento_itens.mes is
  'O Mês do Lançamento (AD-9), copiado para o Realtime ler só o Mês aberto.';

-- Um item por Lançamento em cada Pagamento.
create unique index pagamento_itens_pagamento_lancamento_key
  on public.pagamento_itens (pagamento_id, lancamento_id);
-- "Este Lançamento tem Pagamento?" (só os itens vivos).
create index pagamento_itens_owner_id_lancamento_id_idx
  on public.pagamento_itens (owner_id, lancamento_id)
  where excluido_em is null;
create index pagamento_itens_owner_id_mes_idx on public.pagamento_itens (owner_id, mes);
create index pagamento_itens_owner_id_status_anterior_id_idx on public.pagamento_itens (owner_id, status_anterior_id);
create index pagamento_itens_owner_id_status_aplicado_id_idx on public.pagamento_itens (owner_id, status_aplicado_id);

create trigger pagamento_itens_definir_updated_at
  before insert or update on public.pagamento_itens
  for each row execute function public.definir_updated_at();

alter table public.pagamento_itens enable row level security;

create policy "pagamento_itens_select_dono" on public.pagamento_itens
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "pagamento_itens_insert_dono" on public.pagamento_itens
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "pagamento_itens_update_dono" on public.pagamento_itens
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter table public.pagamento_itens replica identity full;
alter publication supabase_realtime add table public.pagamento_itens;

-- ----------------------------------------------- referências aos cadastros

-- Igual à da História 5.1, mais o Status dos itens de Pagamento. Espelha
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
    ('responsavel'::text, 'contas_manuais'::text, 'responsavel_id'::text, 'coluna'::text, true),
    ('tipo'::text, 'contas_manuais'::text, 'tipo_id'::text, 'coluna'::text, true),
    ('status'::text, 'pagamento_itens'::text, 'status_anterior_id'::text, 'coluna'::text, false),
    ('status'::text, 'pagamento_itens'::text, 'status_aplicado_id'::text, 'coluna'::text, true),
    ('responsavel'::text, 'regras'::text, 'contagem'::text, 'jsonb'::text, false),
    ('responsavel'::text, 'lancamentos'::text, 'revisao_dados'::text, 'jsonb'::text, false),
    ('tipo'::text, 'lancamentos'::text, 'revisao_dados'::text, 'jsonb'::text, false),
    ('responsavel'::text, 'lancamentos'::text, 'divisao'::text, 'jsonb'::text, false),
    ('responsavel'::text, 'regras'::text, 'divisao'::text, 'jsonb'::text, false),
    ('responsavel'::text, 'blocos'::text, 'formula'::text, 'jsonb'::text, true),
    ('tipo'::text, 'blocos'::text, 'formula'::text, 'jsonb'::text, true),
    ('responsavel'::text, 'contas_manuais'::text, 'divisao'::text, 'jsonb'::text, true)
$$;

-- ------------------------------- Status "não pago" à mão numa linha com Pagamento

create function public.recusar_status_nao_pago_com_pagamento()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
       select 1
         from public.pagamento_itens as i
        where i.owner_id = new.owner_id and i.lancamento_id = new.id and i.excluido_em is null
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

create trigger lancamentos_recusar_status_nao_pago
  before update of status_id on public.lancamentos
  for each row
  when (old.status_id is distinct from new.status_id)
  execute function public.recusar_status_nao_pago_com_pagamento();

-- ------------------------------------------------------ pagamento_completo

-- Interna: o Pagamento, os itens e as linhas dele, como as RPCs devolvem.
create function public.pagamento_completo(p_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'pagamento', (
      select to_jsonb(p)
        from public.pagamentos as p
       where p.owner_id = (select auth.uid()) and p.id = p_id
    ),
    'itens', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.mes, i.id)
        from public.pagamento_itens as i
       where i.owner_id = (select auth.uid()) and i.pagamento_id = p_id
    ), '[]'::jsonb),
    'lancamentos', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.mes, l.ordem_fatura, l.id)
        from public.lancamentos as l
       where l.owner_id = (select auth.uid())
         and l.id in (
           select i.lancamento_id
             from public.pagamento_itens as i
            where i.owner_id = (select auth.uid()) and i.pagamento_id = p_id
         )
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.pagamento_completo(uuid) from public, anon;
grant execute on function public.pagamento_completo(uuid) to authenticated;

-- --------------------------------------------------------- aplicar_pagamento

-- `p_pedido` = `{ id, status_id, data, valor_recebido_centavos, modo, itens }`,
-- com `itens` = `[{ lancamento_id, valor_centavos, atualizado_em }]` (o que
-- `planejarPagamento` monta). Devolve `{ pagamento, itens, lancamentos }`.
--
-- Erros: `pagamento.status_invalido` (o Status não existe, está arquivado ou
-- não conta como pago), `pagamento.mudou` (alguma linha mudou ou foi excluída
-- desde que a tela a leu), `pagamento.ja_desfeito` (repetir o pedido de um
-- Pagamento que já foi desfeito) e `salvar.falhou` (formato, soma ou item
-- acima do restante).
create function public.aplicar_pagamento(p_pedido jsonb)
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
  ids uuid[];
  n_itens integer;
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
     or jsonb_typeof(p_pedido -> 'itens') is distinct from 'array' then
    raise exception 'salvar.falhou';
  end if;
  -- Só o modo `total` existe nesta história (parcial e "minha parte" são da 6.2).
  if (p_pedido ->> 'modo') <> 'total' then
    raise exception 'salvar.falhou';
  end if;
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
  ) then
    raise exception 'salvar.falhou';
  end if;

  begin
    pg_id := (p_pedido ->> 'id')::uuid;
    aplicado := (p_pedido ->> 'status_id')::uuid;
    dia := (p_pedido ->> 'data')::date;
    valor := (p_pedido ->> 'valor_recebido_centavos')::integer;
    select array_agg((i ->> 'lancamento_id')::uuid) into ids from jsonb_array_elements(p_pedido -> 'itens') as i;
    perform (i ->> 'atualizado_em')::timestamptz from jsonb_array_elements(p_pedido -> 'itens') as i;
  exception
    when invalid_text_representation or datetime_field_overflow or invalid_datetime_format
         or numeric_value_out_of_range or invalid_parameter_value then
      raise exception 'salvar.falhou';
  end;
  if (select count(distinct x) from unnest(ids) as x) <> cardinality(ids) then
    raise exception 'salvar.falhou';
  end if;
  -- A soma dos itens é o valor recebido (modo `total`).
  if (select sum((i ->> 'valor_centavos')::integer) from jsonb_array_elements(p_pedido -> 'itens') as i) is distinct from valor then
    raise exception 'salvar.falhou';
  end if;

  -- O Pagamento nasce primeiro: o mesmo `id` repetido (duplo toque, resposta
  -- perdida, ou dois aparelhos ao mesmo tempo) espera o primeiro terminar e
  -- recebe o mesmo resultado, sem gravar de novo.
  insert into public.pagamentos (id, valor_recebido_centavos, data, modo)
  values (pg_id, valor, dia, 'total')
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

  -- Nenhuma linha é mãe dividida (AD-8: a Divisão é paga pelas partes), nenhuma
  -- já conta como paga, e cada item é o restante da linha (valor menos o que os
  -- itens vivos já quitaram): nenhum acima, nenhum zero (modo `total`).
  if exists (
    select 1
      from jsonb_array_elements(p_pedido -> 'itens') as i
      join public.lancamentos as l
        on l.owner_id = dono and l.id = (i ->> 'lancamento_id')::uuid
     where (l.divisao is not null and l.dividido_de_id is null)
        or exists (
          select 1 from public.status as s
           where s.owner_id = dono and s.id = l.status_id and s.conta_como_pago
        )
        or (i ->> 'valor_centavos')::integer = 0
        or (i ->> 'valor_centavos')::integer <> l.valor_centavos - coalesce((
          select sum(pi.valor_centavos)
            from public.pagamento_itens as pi
           where pi.owner_id = dono and pi.lancamento_id = l.id and pi.excluido_em is null
        ), 0)
  ) then
    raise exception 'salvar.falhou';
  end if;

  insert into public.pagamento_itens (
    pagamento_id, lancamento_id, mes, valor_centavos, status_anterior_id, status_aplicado_id
  )
  select pg_id, l.id, l.mes, (i ->> 'valor_centavos')::integer, l.status_id, aplicado
    from jsonb_array_elements(p_pedido -> 'itens') as i
    join public.lancamentos as l
      on l.owner_id = dono and l.id = (i ->> 'lancamento_id')::uuid
   order by l.mes, l.id;

  update public.lancamentos as l
     set status_id = aplicado
   where l.owner_id = dono and l.id = any (ids);

  return public.pagamento_completo(pg_id);
end;
$$;

revoke execute on function public.aplicar_pagamento(jsonb) from public, anon;
grant execute on function public.aplicar_pagamento(jsonb) to authenticated;

-- ------------------------------------------------------- desfazer_pagamento

-- `p_pedido` = `{ pagamento_id, devolver }`, com `devolver` =
-- `[{ lancamento_id, status_id, atualizado_em }]` (`planejarDesfazerPagamento`):
-- as linhas que recebem de volta o Status anterior. Exclui o Pagamento e os itens
-- em lógico (as demais linhas ficam como estão). Repetir (já desfeito) não faz
-- nada. Devolve `{ pagamento, itens, lancamentos }`.
create function public.desfazer_pagamento(p_pedido jsonb)
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

  return public.pagamento_completo(pg_id);
end;
$$;

revoke execute on function public.desfazer_pagamento(jsonb) from public, anon;
grant execute on function public.desfazer_pagamento(jsonb) to authenticated;
