-- Dados de exemplo para o teste de restauração do backup (História 1.10).
-- Só no Supabase local do CI (job `backup`); nunca em produção.
--
-- Toda tabela de `public` precisa de ao menos uma linha aqui: o job falha se
-- alguma ficar vazia. Histórias que criarem tabelas acrescentam linhas aqui.
-- Cobre acentos, emoji, nulos e cadastros arquivados.

\set ON_ERROR_STOP on

begin;

-- Usuário fictício (ninguém entra com ele). Colunas como phone ficam nulas.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  'b0000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'exemplo.backup@conta-comigo.test',
  -- Hash bcrypt fictício (não corresponde a senha conhecida).
  '$2a$10$abcdefghijklmnopqrstuuJ8F0b0m8x8xQYc3L9tW2W0d6r2t4y6',
  '2026-11-01 12:00:00+00',
  '{"provider": "email", "providers": ["email"]}',
  '{"nome": "Exemplo Ção 🐱"}',
  '2026-11-01 12:00:00+00', '2026-11-01 12:00:00+00',
  '', '', '', ''
);

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  'b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  '{"sub": "b0000000-0000-4000-8000-000000000001", "email": "exemplo.backup@conta-comigo.test", "email_verified": true}',
  'email',
  '2026-11-01 12:00:00+00', '2026-11-01 12:00:00+00', '2026-11-01 12:00:00+00'
);

-- Responsáveis: acentos, emoji, arquivado.
insert into public.responsaveis (id, owner_id, nome, cor, ordem, arquivado) values
  ('b0000000-0000-4000-8000-000000000101', 'b0000000-0000-4000-8000-000000000001', 'Rafael', 1, 1, false),
  ('b0000000-0000-4000-8000-000000000102', 'b0000000-0000-4000-8000-000000000001', 'Conceição', 2, 2, false),
  ('b0000000-0000-4000-8000-000000000103', 'b0000000-0000-4000-8000-000000000001', 'Zé 🐶', 3, 3, true);

-- Tipos.
insert into public.tipos (id, owner_id, nome, arquivado) values
  ('b0000000-0000-4000-8000-000000000201', 'b0000000-0000-4000-8000-000000000001', 'Casa', false),
  ('b0000000-0000-4000-8000-000000000202', 'b0000000-0000-4000-8000-000000000001', 'Gatos 🐈', false),
  ('b0000000-0000-4000-8000-000000000203', 'b0000000-0000-4000-8000-000000000001', 'Viagem à Bahia', true);

-- Status (um arquivado; o padrão nunca é arquivado).
insert into public.status (id, owner_id, nome, conta_como_pago, arquivado) values
  ('b0000000-0000-4000-8000-000000000301', 'b0000000-0000-4000-8000-000000000001', 'Pago', true, false),
  ('b0000000-0000-4000-8000-000000000302', 'b0000000-0000-4000-8000-000000000001', 'Não pago', false, false),
  ('b0000000-0000-4000-8000-000000000303', 'b0000000-0000-4000-8000-000000000001', 'Pix ✅', true, true);

-- Configurações (uma por dono). Primeiro uso ainda não concluído (nulo).
insert into public.configuracoes (
  id, owner_id, status_padrao_id, aparencia, limite_ajuste_centavos,
  tolerancia_atraso_dias, primeiro_uso_em
) values (
  'b0000000-0000-4000-8000-000000000401', 'b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000302', 'escuro', 250, 12, null
);

-- Ciclo: o gatilho recusa Mês no passado, então usa o mês corrente.
insert into public.config_ciclo (id, owner_id, dia_fechamento, dia_vencimento, vigente_desde) values
  ('b0000000-0000-4000-8000-000000000501', 'b0000000-0000-4000-8000-000000000001', 3, 10,
   to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM'));

-- Fatura de outubro/2026 com um cartão e dois Lançamentos (uma parcela
-- classificada e o crédito de centavos, negativo), mais um Lançamento manual
-- excluído logicamente.
insert into public.faturas (
  id, owner_id, mes, vencimento, fechamento, total_despesas_centavos, total_creditos_centavos,
  saldo_anterior_centavos, pagamentos_centavos, total_a_pagar_centavos, alerta_dispensado_em
) values (
  'b0000000-0000-4000-8000-000000000601', 'b0000000-0000-4000-8000-000000000001',
  '2026-10', '2026-10-06', '2026-09-29', 114074, 8, 748311, 745721, 771367, null
);

insert into public.fatura_cartoes (id, owner_id, fatura_id, final, total_centavos) values
  ('b0000000-0000-4000-8000-000000000701', 'b0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000601', '5061', 114074);

insert into public.lancamentos (
  id, owner_id, nome, nome_normalizado, apelido, valor_centavos, data, parcela_n, parcela_total,
  final_cartao, mes, fatura_id, ordem_fatura, duvida_extracao, lancado_por,
  responsavel_id, tipo_id, status_id, observacao, editado_em, excluido_em, ajuste_de_id
) values
  ('b0000000-0000-4000-8000-000000000801', 'b0000000-0000-4000-8000-000000000001',
   'MSC CRUZEIROS', 'MSC CRUZEIROS', 'Cruzeiro 🚢', 114074, '2026-09-04', 2, 12,
   '5061', '2026-10', 'b0000000-0000-4000-8000-000000000601', 1, false, 'fatura',
   'b0000000-0000-4000-8000-000000000102', 'b0000000-0000-4000-8000-000000000201',
   'b0000000-0000-4000-8000-000000000302', 'Viagem à Bahia', '2026-11-03 12:00:00+00', null, null),
  ('b0000000-0000-4000-8000-000000000802', 'b0000000-0000-4000-8000-000000000001',
   'MSC CRUZEIROS', 'MSC CRUZEIROS', null, -8, '2026-09-04', null, null,
   '5061', '2026-10', 'b0000000-0000-4000-8000-000000000601', 2, true, 'fatura',
   'b0000000-0000-4000-8000-000000000102', 'b0000000-0000-4000-8000-000000000201',
   null, null, null, null, 'b0000000-0000-4000-8000-000000000801'),
  ('b0000000-0000-4000-8000-000000000803', 'b0000000-0000-4000-8000-000000000001',
   'Ótica São José', 'OTICA SAO JOSE', null, 15000, null, null, null,
   null, '2026-11', null, null, false, 'manual',
   null, null, null, null, null, '2026-11-03 13:00:00+00', null);

-- Fila do Revisar (História 3.1): uma linha da Fatura com sugestão com dúvida.
insert into public.lancamentos (
  id, owner_id, nome, nome_normalizado, valor_centavos, data, final_cartao, mes, fatura_id,
  ordem_fatura, lancado_por, revisao_motivo, revisao_dados
) values
  ('b0000000-0000-4000-8000-000000000804', 'b0000000-0000-4000-8000-000000000001',
   'GRASSO FARMÁCIA', 'GRASSO FARMACIA', 3990, '2026-09-20', '5061', '2026-10',
   'b0000000-0000-4000-8000-000000000601', 3, 'fatura', 'sugestao_duvida',
   '{"responsavel_id": "b0000000-0000-4000-8000-000000000101", "tipo_id": "b0000000-0000-4000-8000-000000000201", "outros_responsaveis": ["b0000000-0000-4000-8000-000000000102"]}');

-- Regras (História 3.1): uma limpa e uma com dúvida, uma com cadastro nulo.
insert into public.regras (
  id, owner_id, chave, versao_normalizacao, responsavel_id, tipo_id, contagem, ultimo_uso
) values
  ('b0000000-0000-4000-8000-000000000901', 'b0000000-0000-4000-8000-000000000001',
   'MSC CRUZEIROS', 1, 'b0000000-0000-4000-8000-000000000102', 'b0000000-0000-4000-8000-000000000201',
   '[{"responsavel_id": "b0000000-0000-4000-8000-000000000102", "n": 3}]', '2026-11-03 12:00:00+00'),
  ('b0000000-0000-4000-8000-000000000902', 'b0000000-0000-4000-8000-000000000001',
   'GRASSO FARMACIA', 1, 'b0000000-0000-4000-8000-000000000101', null,
   '[{"responsavel_id": "b0000000-0000-4000-8000-000000000101", "n": 2}, {"responsavel_id": "b0000000-0000-4000-8000-000000000102", "n": 1}]',
   '2026-11-04 12:00:00+00');

-- Séries e previstos (História 3.5): a Série de uma parcela 2/12, a linha real
-- e o previsto 3/12 do Mês seguinte, que aponta para ela.
insert into public.series (
  id, owner_id, nome_normalizado, parcela_total, valor_parcela_centavos, mes_primeira_parcela, ocorrencia
) values
  ('b0000000-0000-4000-8000-000000000a01', 'b0000000-0000-4000-8000-000000000001',
   'MAGALU', 12, 44589, '2026-09', 1);

insert into public.lancamentos (
  id, owner_id, nome, nome_normalizado, valor_centavos, data, parcela_n, parcela_total, final_cartao, mes,
  fatura_id, ordem_fatura, lancado_por, serie_id
) values
  ('b0000000-0000-4000-8000-000000000805', 'b0000000-0000-4000-8000-000000000001',
   'MAGALU', 'MAGALU', 44589, '2026-09-20', 2, 12, '5061', '2026-10',
   'b0000000-0000-4000-8000-000000000601', 40, 'fatura', 'b0000000-0000-4000-8000-000000000a01');

insert into public.lancamentos (
  id, owner_id, nome, nome_normalizado, valor_centavos, parcela_n, parcela_total, mes,
  lancado_por, serie_id, origem_lancamento_id
) values
  ('b0000000-0000-4000-8000-000000000806', 'b0000000-0000-4000-8000-000000000001',
   'MAGALU', 'MAGALU', 44589, 3, 12, '2026-11',
   'sistema', 'b0000000-0000-4000-8000-000000000a01', 'b0000000-0000-4000-8000-000000000805');

commit;
