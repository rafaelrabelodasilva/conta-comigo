-- História 4.5: modelo da mensagem de cobrança (FR-23).
-- Uma coluna jsonb em `configuracoes` (uma linha por dono): saudação, frase
-- do total (com {total}), chave Pix, rodapé e as caixas da linha de detalhe.
-- O formato do jsonb (chaves, limites, marcador) é do núcleo
-- (`src/domain/modelo-mensagem.ts`, schema zod); o banco só garante que é um
-- objeto e que não passa de um tamanho razoável. Linha antiga e linha nova
-- nascem com `{}`, que o núcleo lê como o modelo vazio. A linha já está no
-- Realtime (replica identity full e publicação), então outro aparelho
-- vê a mudança sem nada novo aqui.

alter table public.configuracoes
  add column modelo_mensagem jsonb not null default '{}'::jsonb;

alter table public.configuracoes
  add constraint configuracoes_modelo_mensagem_check
  check (
    jsonb_typeof(modelo_mensagem) = 'object'
    and octet_length(modelo_mensagem::text) <= 8000
  );

comment on column public.configuracoes.modelo_mensagem is
  'Modelo da mensagem de cobrança (FR-23): {saudacao, frase_total, chave_pix, rodape, campos:{nome,parcela,valor}}. Validado pelo schema do núcleo; {} = modelo vazio.';
