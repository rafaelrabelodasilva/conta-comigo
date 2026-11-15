-- História 5.3: Contas que se repetem sozinhas todo dia (FR-17, AD-5, AD-12,
-- AD-13, AD-14, AD-15).
--
-- O cron diário (`GET /api/cron/diario`) roda no servidor com a chave secreta
-- do Supabase (papel `service_role`), que não tem usuário: `auth.uid()` é
-- nulo, e `materializar_contas_manuais` (e a `recriar_filhas` que ela chama)
-- são `security invoker` e leem o dono de `auth.uid()`.
--
-- Decisão (spec 5.3, decisão 1): uma variante que **recebe o dono** e só a
-- chave secreta pode chamar, sem copiar o materializador (AD-15: um só).
--
-- - `materializar_contas_manuais_do_dono(p_owner_id, p_ate_mes, p_parcelas)`:
--   confere que quem chama é `service_role`, fixa o dono da transação em
--   `request.jwt.claim.sub` (`set_config(..., true)`: vale só até o fim desta
--   transação, nunca vaza para outra chamada) e chama a **própria**
--   `materializar_contas_manuais`. É esse `sub` que `auth.uid()` lê, então a
--   RPC existente, a `recriar_filhas` e o `default auth.uid()` de
--   `lancamentos.owner_id` enxergam o dono sem uma linha de SQL copiada.
-- - Quem pode chamar: só `service_role`. `public`, `anon` e `authenticated` ficam
--   sem `execute` (o Supabase concede `execute` a eles por padrão em funções
--   novas, por isso o `revoke` é explícito). Além do `grant`, a função
--   recusa quem não é `service_role` (defesa em profundidade: um `grant` largo
--   demais no futuro não abre a porta para um usuário logado fingir ser outro).
--   Um usuário logado nunca consegue passar `p_owner_id` de outro (AD-5).
-- - `materializar_contas_manuais` e `recriar_filhas` continuam do usuário logado
--   (`salvar_conta_manual` também). Aqui só se concede `execute` a
--   `service_role` nelas, que a função acima chama como `service_role`.
-- - O `p_owner_id` vem do próprio banco (a coluna `owner_id` da Conta, lida
--   pelo servidor), nunca de uma requisição de fora; mesmo assim a RPC
--   interna só grava Contas e Séries daquele dono (`c.owner_id = dono`).

create function public.materializar_contas_manuais_do_dono(p_owner_id uuid, p_ate_mes text, p_parcelas jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user is distinct from 'service_role' then
    raise exception 'auth.sessao_expirou';
  end if;
  if p_owner_id is null then
    raise exception 'salvar.falhou';
  end if;

  -- `auth.uid()` lê `request.jwt.claim.sub`; `true` = só nesta transação.
  perform set_config('request.jwt.claim.sub', p_owner_id::text, true);

  return public.materializar_contas_manuais(p_ate_mes, p_parcelas);
end;
$$;

comment on function public.materializar_contas_manuais_do_dono(uuid, text, jsonb) is
  'Materializa as Contas de um dono para o cron (5.3). Só service_role; fixa o dono da transação e chama materializar_contas_manuais.';

revoke execute on function public.materializar_contas_manuais_do_dono(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.materializar_contas_manuais_do_dono(uuid, text, jsonb) to service_role;

-- As funções que ela chama precisam estar ao alcance de `service_role`.
grant execute on function public.materializar_contas_manuais(text, jsonb) to service_role;
grant execute on function public.recriar_filhas(uuid, jsonb) to service_role;
