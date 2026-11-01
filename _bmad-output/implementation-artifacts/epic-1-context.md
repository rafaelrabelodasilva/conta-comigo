# Epic 1 Context: Entrar e montar a base

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Rafael (usuário único) entra no app pelo iPad e pelo PC com os dados sincronizados em tempo real, instala o app na tela inicial do iPad e monta seus cadastros (Responsáveis com cor, Tipos, Status, Ciclo do cartão e Aparência), pelo Primeiro uso ou por Configurações. Este épico cria a fundação de todo o resto: projeto Next.js publicado na Vercel, banco Supabase protegido por RLS, núcleo de domínio puro com testes, gerenciador único de Realtime, tokens visuais e menu, modo sem internet só para consulta e backup semanal criptografado. Sem ele nenhum épico seguinte tem onde gravar nem como aparecer na tela.

## Stories

- Story 1.1: Criar o projeto e publicá-lo na Vercel
- Story 1.2: Entrar com e-mail e senha
- Story 1.3: Visual base e menu lateral
- Story 1.4: Cadastrar Responsáveis com cor, sincronizados entre aparelhos
- Story 1.5: Cadastrar Tipos
- Story 1.6: Gerenciar Status e substituir cadastros em uso
- Story 1.7: Configurar o Ciclo do cartão e a Aparência
- Story 1.8: Primeiro uso
- Story 1.9: Instalar como app e usar sem internet só para consulta
- Story 1.10: Backup semanal fora do Supabase

## Requirements & Constraints

- **Acesso:** só Rafael entra, com login; cadastro público desligado; dados iguais no PC e no iPad.
- **Tempo real:** qualquer mudança aparece em todas as telas e aparelhos abertos sem recarregar.
- **Cadastros:** criar, renomear, editar e excluir Responsáveis, Tipos e Status. Excluir um cadastro em uso avisa quantos registros o usam e pede substituto ou oferece arquivar; renomear nunca exige substituto. Status tem a marca "conta como pago".
- **Começo do zero:** nada vem pré-cadastrado; o Primeiro uso guia cada cadastro, cada passo pode ser pulado e retomado em Configurações.
- **Ciclo:** dia de fechamento e de vencimento; a mudança vale a partir do próximo Ciclo e nunca reescreve o passado. O fechamento só define o Mês dos lançamentos feitos à mão.
- **Plataforma:** iPad Pro 11" (iPadOS 18+) e PC no navegador. Abaixo de 700 px, só um aviso. Instalável na tela inicial do iPad, sem App Store.
- **Sem internet:** só leitura do que já foi carregado; toda ação de gravar avisa e não grava nem guarda fila no aparelho.
- **Acessibilidade:** toque mínimo 44 × 44 pt, contraste ≥ 4,5:1 nos dois modos (bordas e ícones ≥ 3:1), informação nunca só por cor, texto até 130%, rótulos de VoiceOver.
- **Formatos:** interface em português; datas DD/MM/AA, horas HH:MM, valores "R$ 1.140,74", negativos "- R$ 0,08", meses "Out/26".
- **Privacidade:** dados acessíveis só a Rafael; logs nunca registram texto de Fatura, nomes de Lançamentos nem valores.
- **Backup:** cópia semanal criptografada fora do Supabase, com restauração testada antes do primeiro uso real.

## Technical Decisions

- **Stack:** Node 22, Next.js 16.4.x (piso 16.4.3, App Router, Cache Components desligado), React 19, TypeScript 6.x sem `baseUrl`, Tailwind 4, shadcn/ui (base Radix), zod 4, Vitest, `@supabase/supabase-js` 2.118+ e `@supabase/ssr`, Supabase CLI fixada no `package.json`.
- **Camadas:** `src/domain` (núcleo puro: só TS e zod, imports relativos, "hoje" e Mês aberto como parâmetro, sem rede/banco/relógio/DOM; uma regra de lint impede importar `src/data`, `src/ui`, `src/app`, Next ou Supabase), `src/data` (cliente Supabase, repositórios, `realtime.ts`, `conexao.ts`, `database.types.ts`), `src/features/<area>`, `src/ui` (sem domínio nem dados), `src/server`, `src/app`, `src/proxy.ts`, `supabase/migrations`. Fora do núcleo, `@/` aponta para `src/`.
- **Regras de negócio** só no núcleo, com teste Vitest. O núcleo devolve `{ ok, valor }` / `{ ok: false, erro: { codigo, detalhe } }`; textos para o usuário vêm do mapa único `codigo → mensagem`.
- **Auth e isolamento:** Supabase Auth e-mail + senha com "Esqueci a senha". Toda tabela de negócio tem `owner_id uuid not null default auth.uid()`, RLS ligado e políticas `owner_id = auth.uid()`. Chaves novas: `sb_publishable_…` no navegador, `sb_secret_…` só no servidor. Sessão renovada em `src/proxy.ts` com `getClaims()`.
- **Segredos:** nunca com prefixo `NEXT_PUBLIC_`; só nas variáveis da Vercel e, para o backup, nos segredos do GitHub. Rotas em `src/app/api` exigem sessão.
- **Fonte da verdade:** Supabase. Gravação considerada feita só quando o banco confirma; manda só as colunas alteradas; `updated_at` definido pelo banco. Detector de conexão único em `src/data/conexao.ts`. Um único service worker em `src/app`, que guarda só o casco e nunca responde gravações.
- **Realtime:** gerenciador único `src/data/realtime.ts`, única fonte de estado de dados das telas (lidas por hooks; telas não chamam `supabase.from()`). Ouvintes registrados antes do `subscribe()`, releitura ao (re)conectar, evento só aplica se `updated_at` for mais novo, tabelas com `replica identity full`. Otimismo permitido, desfeito se o banco recusar. Totais calculados nunca são gravados.
- **Schema:** só por migração em `supabase/migrations`; tipos gerados por `supabase gen types` em `src/data/database.types.ts`; nada pelo painel.
- **Convenções:** termos do Glossário em português sem acento (`responsavel`, `tipo`, `status`…); tabelas/colunas `snake_case` no plural; arquivos `kebab-case.ts`, componentes `PascalCase.tsx`; ids `uuid` com `gen_random_uuid()`; dinheiro em `*_centavos integer`; `date` para dias, `timestamptz` para momentos, `mes text` `AAAA-MM`.
- **Exclusão e substituição:** Responsável, Tipo e Status têm `arquivado boolean` (some das escolhas, continua nas somas). RPC `substituir_cadastro(tipo, de_id, para_id)` troca o id em colunas e nos `jsonb` listados na constante `REFERENCIAS_JSONB` do núcleo, numa transação; histórias futuras que criarem referências devem estendê-las, com teste.
- **Configurações:** uma linha por dono em `configuracoes` (Status padrão anulável, tolerância de atraso 10 dias, limite do Ajuste R$ 1,00, aparência, lembretes, modelo da mensagem). Ciclo em `config_ciclo` com `vigente_desde` (`AAAA-MM`). Funções do núcleo `mesDoLancamento(data, configs)` e `vencimentoDoMes(mes, configs)`; "hoje" em `America/Sao_Paulo`.
- **Infraestrutura já criada:**
  - Supabase Free, projeto `conta-comigo` (produção), ref `dpewdzsweowgyyadhjbk`, região `sa-east-1`. É o único projeto; não existe projeto de desenvolvimento. Testes e migrações usam o Supabase local (`supabase start`) e o CI. Migrações vão para produção por `supabase db push` depois do merge.
  - Vercel Hobby, projeto `conta-comigo` (`prj_IkHGS7wYqQNwL0FnujtekgjYO5d1`), ligado a `rafaelrabelodasilva/conta-comigo`, Next.js, Node 22.x, funções em `gru1`. `main` → Production. Previews exigem login na Vercel e não recebem as variáveis do Supabase (nunca apontam para produção). Domínio de produção é público (o app tem login próprio).
  - Variáveis de Production a configurar na 1.1: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. Nenhum segredo vai para arquivos do repositório.
- **Operação:** CI no GitHub Actions (lint, typecheck, testes em todo push e PR). Monitoramento de erros só pelos logs da Vercel, via um utilitário único de log no servidor que nunca registra texto de Fatura, nomes de Lançamentos nem valores. Backup em `.github/workflows/backup.yml`: `supabase db dump` semanal (e disparo manual), criptografado com `age` (chave pública no repositório, privada só com Rafael), artifact com 90 dias; senha do banco só nos segredos do GitHub.

## UX & Interaction Patterns

- **Tokens:** cores, tipografia, espaçamento (4 em 4 px), raios e sombras do DESIGN.md como variáveis CSS e tema do Tailwind, modo claro e escuro (inclui 8 cores de pessoa com pares `fg/bg` por modo). Nenhuma cor literal em componente. Números com algarismos tabulares. Contraste dos pares de tokens verificado por teste automatizado.
- **Tema:** segue o sistema, com opção de fixar Claro/Escuro em Configurações → Aparência, guardada em `configuracoes` e válida em todos os aparelhos.
- **`nav-rail`:** Painel, Revisar, Receber, Previsão, Contas, Config., nessa ordem; item ativo destacado; ⌘/Ctrl + 1…6 no PC; anel de foco de 2 px.
- **Botões e campos:** 44 pt; compactos de 30 px com toque de 44 pt; primário `accent`, secundário contornado, destrutivo `danger-fg`.
- **Comuns:** `toast` de 6 s (um substitui o outro, "Desfazer" opcional), `skeleton` sem tela branca, estado "Não foi possível carregar. Tentar de novo", faixa "Sem conexão. Você pode consultar, mas não alterar" e aviso "Sem conexão. Tente de novo quando a internet voltar" ao tentar gravar.
- **Tom e interação:** termos do Glossário, botões que dizem o que fazem; perguntas sempre "Só este" / "Aplicar a todos"; confirmação só nas destrutivas, "Desfazer" nas demais; Esc fecha e Enter confirma no PC; toque longo abre o mesmo menu do ⋯ (sempre visível).
- **Entrar:** e-mail, senha, "Entrar", "Esqueci a senha"; erro sem dizer qual campo errou; sessão expirada volta para Entrar com "Sua sessão expirou. Entre de novo"; opção "Sair".
- **Configurações:** seções à esquerda, conteúdo à direita. Responsáveis com seletor das 8 cores em círculos de 24 px com ✓, sem repetir cor já usada. Status mostra contagem de uso. Ciclo mostra a nota "O fechamento só define em que mês entram as contas lançadas à mão". Seletores como `form-field` (valor + ▾).
- **Primeiro uso:** tela cheia, Responsáveis → Tipos → Status → Ciclo (reaproveitando as telas de Configurações), cada passo pulável; depois, o Painel vazio mostra "Importe sua primeira fatura". Mockup de referência em `mockups/primeiro-uso.html` do UX.
- **Celular (< 700 px):** aviso "O Conta Comigo foi feito para iPad e computador".

## Cross-Story Dependencies

- 1.1 é pré-requisito de todas: estrutura de pastas, lint do núcleo, Vitest, CI, Supabase local, deploy e utilitário de log.
- 1.2 (login, `proxy.ts`, chaves) vem antes de qualquer tela com dados; 1.3 (tokens, `nav-rail`, toast, mapa `codigo → mensagem`) vem antes das telas de Configurações.
- 1.4 cria o gerenciador `realtime.ts` e o padrão de repositório/tabela (dono, RLS, `replica identity full`, gravação por coluna, tipos gerados) que 1.5, 1.6, 1.7 e todos os épicos seguintes reutilizam.
- 1.6 cria `configuracoes` e a RPC `substituir_cadastro` + `REFERENCIAS_JSONB`; 1.7 usa `configuracoes` (Aparência, limite do Ajuste, tolerância de atraso, usados nos Épicos 2 e 6).
- 1.8 depende de 1.4–1.7; os passos Importar planilha (Épico 3), Blocos e Mensagem (Épico 4) entram no Primeiro uso quando essas histórias forem feitas.
- 1.9 usa o detector `conexao.ts` e pede releitura ao gerenciador de Realtime quando a conexão volta.
- 1.10 depende do projeto Supabase de produção e do Supabase local para o teste de restauração.
- O núcleo de Ciclo (`mesDoLancamento`, `vencimentoDoMes`) da 1.7 é usado depois pela importação (Épico 2), Contas manuais (Épico 5) e atraso (Épico 6).
