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

commit;
