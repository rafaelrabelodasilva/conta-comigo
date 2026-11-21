-- Defeito 1 (PR de correção dos 10 defeitos do deferred-work): a parcela de uma Conta
-- manual que Rafael excluiu à mão no Painel fica excluída (AD-8, AD-16).
--
-- Antes, o índice único `(serie_id, parcela_n)` só olhava as linhas não excluídas, então
-- o Cron das 09:00 e `materializar_contas_manuais` recriavam a parcela no dia seguinte
-- (e o Editar e o Encerrar preenchiam o mesmo buraco).
--
-- Como o banco sabe que a parcela foi "pulada" (decisão A+marca): a exclusão à mão grava
-- só `excluido_em` (como sempre, sem mudar o código do navegador, então esta migração é
-- compatível com o código antigo). O que o banco marca é a exclusão FEITA PELA CONTA:
-- `excluir_linhas_da_conta` (Editar, Encerrar e Excluir a Conta) grava
-- `excluido_pela_conta = true`, e o "Desfazer" do Excluir a Conta (`restaurar_conta_manual`)
-- volta a marca para `false`. Uma linha excluída da Série sem a marca é uma parcela
-- pulada: `materializar_contas_manuais` não a recria. Só a Série de Conta (a de
-- importação, História 3.5, não usa este materializador: "a parcela excluída deixa o n
-- livre" continua valendo lá).
--
-- Funções refeitas (mesma assinatura, mesmos `grant`): `materializar_contas_manuais`,
-- `excluir_linhas_da_conta` e `restaurar_conta_manual`. Nenhuma linha é apagada (AD-16).
--
-- As parcelas que o Cron já recriou antes desta migração não são consertadas: só daqui
-- para a frente. As linhas já excluídas pela Conta antes dela (Conta excluída; Meses
-- depois do Encerramento; `parcela_n` acima do total) recebem a marca abaixo, para o
-- Encerrar estendido ou um total maior as recriarem como antes.

-- ------------------------------------------------ lancamentos.excluido_pela_conta

alter table public.lancamentos add column excluido_pela_conta boolean not null default false;

comment on column public.lancamentos.excluido_pela_conta is
  'Verdadeiro quando a exclusão lógica foi feita pela Conta manual (Editar, Encerrar, Excluir a Conta); falso para a exclusão à mão, que faz a parcela contar como "pulada" (Defeito 1).';

update public.lancamentos as l
   set excluido_pela_conta = true
  from public.contas_manuais as c
 where l.conta_manual_id = c.id
   and l.owner_id = c.owner_id
   and l.excluido_em is not null
   and (
     c.excluido_em is not null
     or (c.encerrada_em_mes is not null and l.mes >= c.encerrada_em_mes)
     or (c.parcela_total is not null and l.parcela_n > c.parcela_total)
   );

-- --------------------------------------------- materializar_contas_manuais

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
     -- Parcela que Rafael excluiu à mão (Defeito 1): fica excluída. Uma linha excluída
     -- da Série SEM a marca `excluido_pela_conta` ocupa o `parcela_n`; as que o Editar,
     -- o Encerrar e o Excluir da Conta excluíram levam a marca e não ocupam (o Editar as
     -- recria, o Encerrar estendido as devolve).
     where not exists (
       select 1
         from public.lancamentos as x
        where x.owner_id = dono
          and x.serie_id = s.id
          and x.parcela_n = (p ->> 'parcela_n')::integer
          and x.dividido_de_id is null
          and x.excluido_em is not null
          and not x.excluido_pela_conta
     )
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

  -- A marca diz que quem excluiu foi a Conta (Editar, Encerrar, Excluir a Conta), não
  -- Rafael na grade: o materializador não trata essas linhas como "puladas".
  update public.lancamentos as l
     set excluido_em = agora,
         excluido_pela_conta = true
   where l.owner_id = dono and l.id = any (ids);

  return ids;
end;
$$;

-- -------------------------------------------------- restaurar_conta_manual

create or replace function public.restaurar_conta_manual(p_pedido jsonb)
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
       set excluido_em = null,
           excluido_pela_conta = false
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
