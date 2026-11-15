-- História 4.2: Blocos no Painel (FR-19, FR-54).
--
-- - Excluir Bloco: nada novo no schema. A política `blocos_delete_dono` (4.1)
--   já deixa o dono apagar a própria linha, e o `replica identity full` faz o
--   DELETE chegar inteiro ao Realtime dos outros aparelhos. Apagar o Bloco
--   marcado "É o meu Bloco" só libera a marca: o índice parcial
--   `blocos_owner_id_meu_bloco_key` (um por dono) continua coerente e nenhum
--   outro Bloco a herda. Nenhuma outra tabela aponta para `blocos`.
-- - `reordenar_blocos`: grava a ordem do Painel numa transação só. Os ids
--   pedidos ganham 1, 2, 3… na ordem em que vieram; um Bloco do dono que não
--   veio na lista (criado em outro aparelho enquanto Rafael arrastava) vai
--   depois deles, na ordem em que já estava. Só muda a linha cuja `ordem`
--   muda, e devolve só essas linhas (vão para o gerenciador de Realtime).
--   security invoker: as políticas de RLS valem como numa gravação comum, e
--   um id de outro dono ou inexistente é ignorado.

create or replace function public.reordenar_blocos(p_ids uuid[])
returns setof public.blocos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dono uuid := (select auth.uid());
  pedidos uuid[] := coalesce(p_ids, '{}');
  total integer := coalesce(cardinality(p_ids), 0);
begin
  if dono is null then
    raise exception 'bloco.nao_encontrado';
  end if;

  return query
  with dos_pedidos as (
    select distinct on (t.id) t.id, t.posicao::integer as nova
      from unnest(pedidos) with ordinality as t(id, posicao)
     order by t.id, t.posicao
  ),
  do_resto as (
    select b.id,
           (total + row_number() over (order by b.ordem, b.nome, b.id))::integer as nova
      from public.blocos as b
     where b.owner_id = dono
       and b.id <> all (pedidos)
  ),
  novas as (
    select id, nova from dos_pedidos
    union all
    select id, nova from do_resto
  ),
  mudaram as (
    update public.blocos as b
       set ordem = n.nova
      from novas as n
     where b.id = n.id
       and b.owner_id = dono
       and b.ordem is distinct from n.nova
    returning b.*
  )
  select * from mudaram;
end;
$$;

revoke execute on function public.reordenar_blocos(uuid[]) from public, anon;
grant execute on function public.reordenar_blocos(uuid[]) to authenticated;
