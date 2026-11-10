-- História 3.3: Classificar em lote (FR-14, AD-1, AD-3, AD-14).
--
-- `classificar_em_lote(p_itens jsonb)` grava várias linhas de `lancamentos`
-- numa transação: tudo ou nada. `p_itens` é uma lista de `{ id, corpo }`; cada
-- `corpo` traz as colunas que o núcleo (`planejarLote`) já calculou, de uma
-- lista fechada: responsavel_id, tipo_id, status_id, observacao,
-- revisao_motivo, revisao_dados, revisado_em e editado_em. Chave ausente =
-- coluna intocada; `null` = grava nulo. Itens com valores diferentes cabem na
-- mesma chamada ("Aplicar sugestões"), e o "Desfazer" é a mesma chamada com os
-- valores de antes. A RPC só grava; nenhuma regra de negócio mora aqui (AD-1).
--
-- Recusa tudo (`salvar.falhou`) se p_itens não é uma lista, se tem mais de
-- 1000 itens, se um item não é `{ id, corpo }` com `corpo` objeto de colunas
-- da lista, se um `id` se repete, ou se algum `id` não existe, é de outro
-- dono ou está excluído. Lista vazia: devolve [] sem tocar em nada.
--
-- Devolve as linhas gravadas (jsonb) para o gerenciador de Realtime aplicar
-- (AD-4). `updated_at` é do banco (gatilho). security invoker: o RLS vale como
-- numa gravação comum; search_path vazio, como `importar_fatura`.
create or replace function public.classificar_em_lote(p_itens jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  colunas constant text[] := array[
    'responsavel_id', 'tipo_id', 'status_id', 'observacao',
    'revisao_motivo', 'revisao_dados', 'revisado_em', 'editado_em'
  ];
  total integer;
  n_gravadas integer;
  linhas jsonb;
begin
  if dono is null then
    raise exception 'auth.sessao_expirou';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'salvar.falhou';
  end if;
  total := jsonb_array_length(p_itens);
  if total = 0 then
    return '[]'::jsonb;
  end if;
  if total > 1000 then
    raise exception 'salvar.falhou';
  end if;

  -- Cada item é { id, corpo }, com o corpo um objeto só de colunas da lista.
  if exists (
    select 1
      from jsonb_array_elements(p_itens) as i
     where jsonb_typeof(i) is distinct from 'object'
        or jsonb_typeof(i -> 'id') is distinct from 'string'
        or jsonb_typeof(i -> 'corpo') is distinct from 'object'
  ) then
    raise exception 'salvar.falhou';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_itens) as i,
           jsonb_object_keys(i -> 'corpo') as k
     where k <> all (colunas)
  ) then
    raise exception 'salvar.falhou';
  end if;
  if (select count(distinct i ->> 'id') from jsonb_array_elements(p_itens) as i) <> total then
    raise exception 'salvar.falhou';
  end if;

  with itens as (
    select (i ->> 'id')::uuid as id, i -> 'corpo' as corpo
      from jsonb_array_elements(p_itens) as i
  ),
  gravadas as (
    update public.lancamentos as l
       set responsavel_id = case when itens.corpo ? 'responsavel_id'
             then (itens.corpo ->> 'responsavel_id')::uuid else l.responsavel_id end,
           tipo_id = case when itens.corpo ? 'tipo_id'
             then (itens.corpo ->> 'tipo_id')::uuid else l.tipo_id end,
           status_id = case when itens.corpo ? 'status_id'
             then (itens.corpo ->> 'status_id')::uuid else l.status_id end,
           observacao = case when itens.corpo ? 'observacao'
             then itens.corpo ->> 'observacao' else l.observacao end,
           revisao_motivo = case when itens.corpo ? 'revisao_motivo'
             then (itens.corpo ->> 'revisao_motivo')::public.revisao_motivo else l.revisao_motivo end,
           revisao_dados = case when itens.corpo ? 'revisao_dados'
             then case when jsonb_typeof(itens.corpo -> 'revisao_dados') = 'object'
               then itens.corpo -> 'revisao_dados' end
             else l.revisao_dados end,
           revisado_em = case when itens.corpo ? 'revisado_em'
             then (itens.corpo ->> 'revisado_em')::timestamptz else l.revisado_em end,
           editado_em = case when itens.corpo ? 'editado_em'
             then (itens.corpo ->> 'editado_em')::timestamptz else l.editado_em end
      from itens
     where l.id = itens.id
       and l.owner_id = dono
       and l.excluido_em is null
    returning l.*
  )
  select count(*), coalesce(jsonb_agg(to_jsonb(g) order by g.mes, g.ordem_fatura, g.id), '[]'::jsonb)
    into n_gravadas, linhas
    from gravadas as g;

  -- Algum id não existe, é de outro dono ou está excluído: nada fica gravado.
  if n_gravadas <> total then
    raise exception 'salvar.falhou';
  end if;

  return linhas;
end;
$$;

revoke execute on function public.classificar_em_lote(jsonb) from public, anon;
grant execute on function public.classificar_em_lote(jsonb) to authenticated;
