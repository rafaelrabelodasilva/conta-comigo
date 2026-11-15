-- História 5.1: Cadastrar uma Conta manual (FR-16, FR-17, AD-1, AD-8, AD-9,
-- AD-14, AD-15, AD-16).
--
-- - `contas_manuais`: o cadastro da Conta (Nome, Valor por parcela ou mês, Tipo,
--   Responsável ou Divisão, Observação, Mês inicial, repetição mensal ou
--   parcelas, `encerrada_em_mes`). Quem a classifica é o Responsável (uma pessoa
--   só) ou a `divisao` (duas ou mais partes, em frações, no formato de
--   src/domain/divisao.ts), nunca os dois. Padrão de toda tabela de negócio
--   (AD-3/4/5): dono por auth.uid(), RLS, updated_at só pelo banco, replica
--   identity full e publicação no Realtime.
-- - `series.conta_manual_id`: cada Conta tem **uma** Série (AD-8, AD-15). Quem
--   liga as duas é esta coluna (única); a chave
--   `(owner_id, nome_normalizado, parcela_total, valor_parcela_centavos,
--   mes_primeira_parcela, ocorrencia)` continua sendo a do AD-8 e é calculada
--   pelo núcleo (src/domain/contas-manuais.ts). Na Conta recorrente
--   `parcela_total` é nulo, e a unicidade vem do índice parcial
--   `series_conta_chave_key` (nulo vale 0). Duas Contas idênticas: o núcleo dá
--   `ocorrencia` 1 e 2.
-- - `lancamentos.conta_manual_id`: a Conta que gerou o Lançamento (mães e
--   filhas). É ele que diz "este Lançamento é de uma Conta" (previsto enquanto
--   o Mês não tem Fatura, derivado no núcleo); o `lancado_por` fica `manual`.
-- - `lancamentos_parcela_par_check`: a recorrente tem `parcela_n` (conta desde
--   o Mês inicial, AD-15) sem `parcela_total`; só o inverso é proibido.
-- - `referencias_cadastro()`: a Conta cita Tipo e Responsável (colunas e dentro
--   da `divisao`) e conta uso: excluir um deles exige substituto, e
--   `substituir_cadastro` troca o id na Conta também. Espelha
--   REFERENCIAS_COLUNAS e REFERENCIAS_JSONB de src/domain/cadastros.ts.
-- - `materializar_contas_manuais(p_ate_mes, p_parcelas)`: o único materializador
--   (AD-15). Recebe as parcelas que o núcleo calculou (`parcelasDaConta`) e só
--   as grava, com `on conflict (serie_id, parcela_n) ... do nothing`: rodar de
--   novo não duplica nada. Com Divisão, cada parcela é uma linha-mãe com
--   `divisao` e as filhas (`recriar_filhas`, como no AD-8).
-- - `salvar_conta_manual(p_conta, p_parcelas, p_ate_mes)`: cria a Conta e a
--   Série e materializa, tudo numa transação. O `id` da Conta vem da tela; enviar
--   de novo o mesmo `id` não duplica e não altera a Conta (alterar é da 5.4).

-- ----------------------------------------------------------- contas_manuais

create table public.contas_manuais (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  nome text not null,
  -- Por parcela (parcelas) ou por mês (mensal). A soma das partes da `divisao`.
  valor_centavos integer not null,
  tipo_id uuid not null,
  responsavel_id uuid,
  observacao text,
  -- Mês (AAAA-MM) da parcela 1: `parcela_n` conta desde ele (AD-15).
  mes_inicial text not null,
  repeticao text not null,
  parcela_total integer,
  -- A Divisão em frações (src/domain/divisao.ts); nulo com um Responsável só.
  divisao jsonb,
  -- A Conta vale até o Mês anterior a este (5.4); nulo = sem fim.
  encerrada_em_mes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contas_manuais_nome_check
    check (nome = btrim(nome) and char_length(nome) between 1 and 200),
  constraint contas_manuais_valor_check check (valor_centavos > 0),
  constraint contas_manuais_observacao_check
    check (observacao is null or char_length(observacao) <= 200),
  constraint contas_manuais_mes_inicial_check check (mes_inicial ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint contas_manuais_encerrada_check
    check (encerrada_em_mes is null or (encerrada_em_mes ~ '^\d{4}-(0[1-9]|1[0-2])$' and encerrada_em_mes >= mes_inicial)),
  constraint contas_manuais_repeticao_check check (repeticao in ('mensal', 'parcelas')),
  constraint contas_manuais_parcelas_check
    check (
      (repeticao = 'parcelas' and parcela_total is not null and parcela_total >= 2 and parcela_total <= 999)
      or (repeticao = 'mensal' and parcela_total is null)
    ),
  -- Um Responsável ou uma Divisão (nunca os dois, nunca nenhum).
  constraint contas_manuais_classificacao_check check ((responsavel_id is null) <> (divisao is null)),
  constraint contas_manuais_divisao_check check (divisao is null or jsonb_typeof(divisao) = 'object'),
  -- Alvo das chaves compostas de `series` e `lancamentos`.
  constraint contas_manuais_owner_id_id_key unique (owner_id, id),
  constraint contas_manuais_tipo_fkey
    foreign key (owner_id, tipo_id)
    references public.tipos (owner_id, id),
  constraint contas_manuais_responsavel_fkey
    foreign key (owner_id, responsavel_id)
    references public.responsaveis (owner_id, id)
);

comment on table public.contas_manuais is
  'Conta manual (Glossário): conta fora do cartão, cadastrada uma vez e materializada em Lançamentos mês a mês (AD-15).';
comment on column public.contas_manuais.valor_centavos is
  'Valor por parcela (parcelas) ou por mês (mensal); com Divisão, a soma das partes.';
comment on column public.contas_manuais.divisao is
  'Divisão em frações (src/domain/divisao.ts), no formato de lancamentos.divisao. Nulo = um Responsável só.';
comment on column public.contas_manuais.encerrada_em_mes is
  'A Conta não gera Lançamentos deste Mês em diante (História 5.4). Nulo = sem fim.';

create index contas_manuais_owner_id_tipo_id_idx on public.contas_manuais (owner_id, tipo_id);
create index contas_manuais_owner_id_responsavel_id_idx on public.contas_manuais (owner_id, responsavel_id);

create trigger contas_manuais_definir_updated_at
  before insert or update on public.contas_manuais
  for each row execute function public.definir_updated_at();

alter table public.contas_manuais enable row level security;

create policy "contas_manuais_select_dono" on public.contas_manuais
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "contas_manuais_insert_dono" on public.contas_manuais
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "contas_manuais_update_dono" on public.contas_manuais
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "contas_manuais_delete_dono" on public.contas_manuais
  for delete to authenticated
  using (owner_id = (select auth.uid()));

alter table public.contas_manuais replica identity full;
alter publication supabase_realtime add table public.contas_manuais;

-- ------------------------------------------------------------------- series

alter table public.series
  add column conta_manual_id uuid,
  alter column parcela_total drop not null;

alter table public.series drop constraint series_parcela_total_check;

alter table public.series
  add constraint series_parcela_total_check
    check (parcela_total is null or (parcela_total >= 2 and parcela_total <= 999)),
  -- Só a Série de uma Conta recorrente não tem total.
  add constraint series_parcela_total_conta_check
    check (parcela_total is not null or conta_manual_id is not null),
  add constraint series_conta_manual_fkey
    foreign key (owner_id, conta_manual_id)
    references public.contas_manuais (owner_id, id);

comment on column public.series.conta_manual_id is
  'A Conta manual dona da Série (1 para 1). Nulo = Série de uma compra parcelada da Fatura.';

-- Cada Conta tem uma Série só.
create unique index series_conta_manual_id_key
  on public.series (conta_manual_id)
  where conta_manual_id is not null;

-- A chave do AD-8 também vale para a Série recorrente (`parcela_total` nulo
-- vale 0 aqui; a chave completa `series_chave_key` já cobre as parceladas).
create unique index series_conta_chave_key
  on public.series (
    owner_id, nome_normalizado, (coalesce(parcela_total, 0)), valor_parcela_centavos, mes_primeira_parcela, ocorrencia
  )
  where conta_manual_id is not null;

-- ------------------------------------------------------------- lancamentos

alter table public.lancamentos add column conta_manual_id uuid;

comment on column public.lancamentos.conta_manual_id is
  'A Conta manual que gerou o Lançamento (mãe e filhas). Vira nulo se a Conta for apagada.';

alter table public.lancamentos
  add constraint lancamentos_conta_manual_fkey
    foreign key (owner_id, conta_manual_id)
    references public.contas_manuais (owner_id, id)
    on delete set null (conta_manual_id);

create index lancamentos_owner_id_conta_manual_id_idx on public.lancamentos (owner_id, conta_manual_id);

-- A recorrente tem `parcela_n` sem `parcela_total` (AD-15); o total exige o n.
alter table public.lancamentos drop constraint lancamentos_parcela_par_check;
alter table public.lancamentos
  add constraint lancamentos_parcela_par_check
    check (parcela_total is null or parcela_n is not null);

-- ----------------------------------------------- referências aos cadastros

-- Igual à da História 4.1, mais a Conta manual: Tipo e Responsável (colunas) e
-- o Responsável dentro da `divisao`. Todas contam uso: sem substituto, a Conta
-- ficaria sem Tipo (não nulo) ou sem quem a classifique.
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
    ('responsavel'::text, 'regras'::text, 'contagem'::text, 'jsonb'::text, false),
    ('responsavel'::text, 'lancamentos'::text, 'revisao_dados'::text, 'jsonb'::text, false),
    ('tipo'::text, 'lancamentos'::text, 'revisao_dados'::text, 'jsonb'::text, false),
    ('responsavel'::text, 'lancamentos'::text, 'divisao'::text, 'jsonb'::text, false),
    ('responsavel'::text, 'regras'::text, 'divisao'::text, 'jsonb'::text, false),
    ('responsavel'::text, 'blocos'::text, 'formula'::text, 'jsonb'::text, true),
    ('tipo'::text, 'blocos'::text, 'formula'::text, 'jsonb'::text, true),
    ('responsavel'::text, 'contas_manuais'::text, 'divisao'::text, 'jsonb'::text, true)
$$;

-- --------------------------------------------- materializar_contas_manuais

-- Grava as parcelas que o núcleo calculou (`parcelasDaConta`): cada item é
-- `{ conta_id, parcela_n, mes, valor_centavos, partes }`, com `partes` (os
-- valores das filhas, AD-2) quando a Conta tem Divisão. Os dados da Conta
-- (Nome, Tipo, Responsável, Observação, Divisão, `parcela_total`) vêm da
-- própria Conta e da Série dela. Idempotente: a parcela que já existe (não
-- excluída) fica como está. Nenhuma parcela passa de `p_ate_mes` (o horizonte,
-- Mês atual + 12, é do núcleo; aqui é rede de segurança). Devolve as linhas
-- novas (mães e filhas).
create function public.materializar_contas_manuais(p_ate_mes text, p_parcelas jsonb)
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
  ) then
    raise exception 'salvar.falhou';
  end if;

  -- Toda parcela é de uma Conta do dono que já tem Série.
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
        on c.owner_id = dono and c.id = (p ->> 'conta_id')::uuid
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

revoke execute on function public.materializar_contas_manuais(text, jsonb) from public, anon;
grant execute on function public.materializar_contas_manuais(text, jsonb) to authenticated;

-- ------------------------------------------------------ salvar_conta_manual

-- Cria a Conta (o `id` vem da tela), a Série dela (a chave vem do núcleo) e
-- materializa as parcelas, numa transação. Mandar de novo o mesmo `id` (duplo
-- toque, resposta perdida) não duplica nada e não altera a Conta já salva:
-- só materializa o que faltar. Duas Contas idênticas usam `ocorrencia` 1 e 2
-- (o núcleo escolhe); se outra foi salva no meio, a chave estoura e vira
-- `conta.serie_ocupada` (a tela relê e tenta de novo). Devolve a Conta e as
-- linhas novas.
create function public.salvar_conta_manual(p_conta jsonb, p_parcelas jsonb, p_ate_mes text)
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

revoke execute on function public.salvar_conta_manual(jsonb, jsonb, text) from public, anon;
grant execute on function public.salvar_conta_manual(jsonb, jsonb, text) to authenticated;
