---
title: 'História 1.3: Visual base e menu lateral'
type: 'feature'
created: '2026-11-02'
status: 'in-review'
route: 'dispatch'
baseline_commit: 'cf35950dd55562f7a131e505ab5d66d283d9f0f0'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-conta-comigo-2026-11-01/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** O app ainda tem o visual padrão do Next.js e uma página só. As próximas histórias (Configurações, Painel) precisam dos tokens do DESIGN.md, do menu lateral, das telas e dos componentes comuns para não inventar cada um o seu.

**Approach:** Tokens do DESIGN.md como variáveis CSS (claro e escuro pelo sistema) e tema do Tailwind 4, sem a paleta padrão. Componentes no padrão shadcn/ui (Radix) em `src/ui`. Um layout autenticado com o `nav-rail` e as seis telas com título e estado vazio provisório, mais os componentes comuns (toast, skeleton, erro ao carregar, faixa de pergunta, confirmação, menu ⋯ com toque longo) e o mapa `codigo → mensagem` estendido.

## Boundaries & Constraints

**Always:**
- Nenhuma cor literal fora de `src/app/globals.css` (teste automatizado). Tailwind sem a paleta padrão (`--color-*: initial`), só tokens.
- Contraste testado a partir do próprio `globals.css`: texto ≥ 4,5:1 e bordas de destaque/ícones ≥ 3:1, nos dois modos; cores com transparência compostas sobre `surface`.
- Área de toque mínima de 44 px em tudo que é tocável; compactos de 30 px com área de toque de 44 px.
- Textos para o usuário saem de `src/domain/mensagens.ts`; "Só este" e "Aplicar a todos" são constantes únicas.
- Lógica testável (toast, toque longo, atalhos, item ativo) em funções puras com teste Vitest, porque o projeto não tem DOM nos testes.

**Never:**
- Fixar Claro/Escuro em Configurações (História 1.7), faixa "Sem conexão" ligada à rede (1.9), contador real do Revisar (Épico 3), lista de Blocos no celular (Épico 4).
- Instalar `@testing-library`/jsdom, `sonner` ou biblioteca de ícones; usar a CLI do shadcn (sem rede).
- Mudar o comportamento de Entrar e da sessão da 1.2.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Navegar | Toque em "Receber" | Abre `/recebimentos`; item com `aria-current="page"` e destaque | N/A |
| Subrota | Caminho `/configuracoes/x` | Config. ativo; `/` só ativa Painel no caminho exato | N/A |
| Atalho | ⌘/Ctrl + 3 no PC | Vai para Receber; sem modificador, ou com Alt/Shift, ignora | Atalho dentro de campo de texto: ignora |
| Toast novo | Toast aberto e chega outro | O novo substitui; tempo de 6 s recomeça | "Desfazer" fecha o toast e chama a ação uma vez |
| Toque longo | Dedo parado 500 ms | Abre o mesmo menu do ⋯ | Soltar, mover > 10 px ou cancelar antes: nada |
| Tela estreita | Largura < 700 px | Só o aviso "O Conta Comigo foi feito para iPad e computador" | Entrar continua usável |

</frozen-after-approval>

## Code Map

- `src/app/globals.css` -- hoje só tem `--background/--foreground` provisórios. Vira a fonte única dos tokens.
- `src/app/layout.tsx` -- layout raiz; mantém `lang="pt-BR"`, ganha `color-scheme` e as classes de token.
- `src/app/page.tsx` -- Painel provisório com "Sair" e `temSessao()`. Sai daqui para o grupo `(app)`; "Sair" vai para Configurações (IA do EXPERIENCE.md).
- `src/data/supabase/servidor.ts` (`temSessao`) e `src/features/entrar/acoes.ts` (`sair`) -- reusar, não mudar.
- `src/data/supabase/sessao.ts` -- todas as rotas novas já são protegidas pelo proxy (só `/entrar` e `/auth/confirmar` são públicas). Não mudar.
- `src/domain/mensagens.ts` (+ teste) -- mapa único; estender com os códigos novos.
- `src/features/entrar/Formulario*.tsx`, `src/app/entrar`, `src/app/redefinir-senha` -- usam classes cruas (`border`, `rounded`). Passar a usar `Botao`/`Campo` sem mudar o comportamento.
- `eslint.config.mjs`, `vitest.config.mts` (ambiente `node`) -- sem mudança, exceto se o teste de contraste precisar ler arquivo (usar `node:fs` no teste, fora de `src/domain`).
- Mockup `ux-designs/.../mockups/painel.html` -- SVGs de traço 1,8 dos seis ícones do menu (copiar os `path`).
- Next 16.4: ler `node_modules/next/dist/docs/01-app/` sobre route groups, `usePathname`, `Link` e layouts antes de escrever.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- adicionar `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`; criar `components.json` (estilo shadcn, aliases `@/ui`) -- base dos componentes.
- [x] `src/app/globals.css` -- todas as cores do DESIGN.md (claro em `:root`, escuro em `prefers-color-scheme: dark`), `@theme inline` com cores, raios (`sm/md/lg/full`), espaçamentos nomeados (`rail`, `toque`, `linha`, `icone`, `painel-lateral`), sombras (`flutuante`, `popover`, `lateral`); `@utility` para cada papel tipográfico (`texto-hero-value` … `texto-message`, com `tabular-nums` nos numéricos); `:focus-visible` com anel de 2 px em `focus-ring` -- UX-DR1–3.
- [x] `src/ui/contraste.ts` + `src/ui/tokens.test.ts` -- funções puras de luminância/contraste/composição; o teste lê `globals.css`, confere que existem todos os tokens do DESIGN.md nos dois modos e mede os pares listados nas Design Notes -- verificação automatizada.
- [x] `test/sem-cor-literal.test.ts` -- falha se `src/**/*.{ts,tsx,css}`, exceto `globals.css`, tiver `#rgb`, `rgb(`, `hsl(` ou classes de paleta padrão -- regra "sem cor literal".
- [x] `src/ui/cn.ts`, `src/ui/Botao.tsx`, `src/ui/Campo.tsx`, `src/ui/Esqueleto.tsx` -- variantes `primario`/`secundario`/`destrutivo` × `padrao`(44)/`compacto`(30, toque 44 via pseudo-elemento); campo de 44 com erro em `danger-fg` e mensagem abaixo -- UX-DR27, UX-DR28.
- [x] `src/ui/toast.ts` (+ teste) e `src/ui/Toast.tsx` -- redutor puro (mostrar substitui, fechar, desfazer) e provedor com `useToast()`, 6 s, `aria-live="polite"`, pílula `nav` -- UX-DR28.
- [x] `src/ui/toque-longo.ts` (+ teste), `src/ui/MenuAcoes.tsx` -- detector com timers injetados; botão ⋯ sempre visível (Radix DropdownMenu, 44 px) que o toque longo abre -- UX-DR32.
- [x] `src/ui/Janela.tsx`, `src/ui/ConfirmarAcao.tsx`, `src/ui/FaixaPergunta.tsx`, `src/ui/ErroAoCarregar.tsx`, `src/ui/EstadoVazio.tsx` -- Dialog (Esc fecha), AlertDialog com botão destrutivo focado (Enter confirma), faixa âmbar com "Só este"/"Aplicar a todos", "Não foi possível carregar." + "Tentar de novo" -- UX-DR30, UX-DR32.
- [x] `src/ui/navegacao.ts` (+ teste) -- lista dos 6 itens (rótulo, rota, ícone), `itemAtivo(caminho)` e `destinoDoAtalho(evento)` -- regras do menu.
- [x] `src/ui/NavRail.tsx` -- Client Component: `Link`s com `aria-current`, rótulos `nav-label`, ativo com fundo branco 8% e ícone `accent-line`, atalhos ⌘/Ctrl+1…6 por `router.push` -- UX-DR5.
- [x] `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `revisar/`, `recebimentos/`, `previsao/`, `contas/`, `configuracoes/` -- rail + conteúdo com `ToastProvider`; cada página confere `temSessao()`, mostra título (`texto-title`) e `EstadoVazio` provisório; Configurações tem "Sair"; abaixo de 700 px, só o aviso -- UX-DR5, UX-DR31.
- [x] `src/domain/mensagens.ts` (+ teste) -- códigos `app.tela_pequena`, `carregar.falhou`, `salvar.falhou`, `conexao.sem_conexao`, `conexao.gravar_sem_conexao`, `acao.desfeita`, e `RESPOSTAS_PERGUNTA` -- UX-DR34.
- [x] `src/features/entrar/*.tsx`, `src/app/entrar/page.tsx`, `src/app/redefinir-senha/page.tsx` -- trocar classes cruas por `Botao`/`Campo`/tokens -- consistência visual.

**Acceptance Criteria:**
- Given o sistema em modo escuro, when o app abre, then as cores são as `-dark` do DESIGN.md sem recarregar nada.
- Given o teste de contraste, when roda no CI, then todo par de texto tem ≥ 4,5:1 e bordas/ícones ≥ 3:1 nos dois modos.
- Given qualquer tela autenticada, when Rafael navega pelo teclado, then o foco aparece com anel de 2 px.
- Given um Client Component com classe `bg-red-500`, when o teste de cor literal roda, then falha.

## Implementation Notes

- **Desvio do DESIGN.md (pede aprovação):** branco sobre `verify` no escuro (`#F87171`) dá 2,77:1. Criado o token `--on-verify`: branco no claro (4,83:1) e `#0F1112` no escuro (6,84:1). Só aparece no contador do Revisar, que ainda não recebe número (Épico 3).
- Tokens derivados além do DESIGN.md: `--on-dark` (branco do toast e do rótulo ativo) e `--nav-active` (branco a 8%). Breakpoint `app` = 700 px.
- Extras: `Tela.tsx` (título da tela), `app.em_breve` e `ROTULOS` em `mensagens.ts`.
- Toast com raio `md` (token do DESIGN.md), não pílula.
- `src/app/(app)/layout.test.tsx` cobre a linha "tela estreita" da matriz (renderiza o layout com o menu simulado).
- Atalhos ⌘/Ctrl+1…6 podem ser tomados pelo navegador para trocar de aba; conferir num PC/Mac de verdade.

## Spec Change Log

## Review Triage Log

Revisão 1 (blind-hunter, edge-case-hunter, verification-gap):

| # | Achado | Veredito | Evidência | Rota |
|---|--------|----------|-----------|------|
| 1 | `engolirClique` fica ligado depois de toque longo sem `click` e engole o próximo clique de mouse ou teclado (blind, edge, verification-gap) | medium | O retorno do mouse em `onPointerDown` vem antes de zerar a flag; teclado nunca zera | patch |
| 2 | Segurar um item do menu (portal) por 500 ms borbulha até o invólucro e o clique do item é engolido | medium | Eventos React atravessam o portal; `onClickCapture` do invólucro roda antes do item | patch |
| 3 | Segundo dedo reinicia ou cancela o toque longo | low | Raro; correção exige rastrear `pointerId` | rejeitado |
| 4 | `Botao asChild` num Server Component pode quebrar (Slot usa `useComposedRefs`, sem "use client") | maybe-false | `react-slot` não tem "use client"; resolveria renderizar uma página servidor com `asChild`. Nenhum uso hoje | defer |
| 5 | `type` é descartado com `asChild` | low | `type` sai da desestruturação e não volta ao Slot | patch |
| 6 | `aria-describedby`/`aria-invalid` do chamador sobrescrevem o vínculo do erro em `Campo` | low | Spread depois dos atributos; correção direta | patch |
| 7 | ⌘/Ctrl+1…6 navega com Janela ou Confirmação aberta e perde o que estava nela (blind, edge) | medium | O ouvinte global ignora só campos de texto | patch |
| 8 | Tecla segurada (`repeat`) chama `router.push` várias vezes | low | Correção direta | patch |
| 9 | Atalhos navegam abaixo de 700 px | low | Só troca a rota por trás do mesmo aviso | rejeitado |
| 10 | Entidade HTML (`&#8942;`) acusa falso positivo de cor | low | Regex casa `#8942`; correção direta | patch |
| 11 | Cores nomeadas e valores arbitrários (`bg-[red]`, `text-[tomato]`) escapam da regra (blind, edge) | medium | Regex só conhece hex, funções e paleta | patch |
| 12 | `.js/.jsx/.mjs` em `src` não são varridos | low | Filtro de extensão; correção direta | patch |
| 13 | `lerTokens` erra se o `@media` vier antes do `:root` | low | Ordem fixa no arquivo; exigiria reescrever o leitor | rejeitado |
| 14 | Par com token ausente dá TypeError pouco claro | low | Falha alto mesmo assim | rejeitado |
| 15 | `key={item.rotulo}` duplica com rótulos iguais | low | Correção direta | patch |
| 16 | Itens do menu ⋯ com `outline-none`: sem anel de 2 px no teclado | medium | O utilitário sobrepõe o `:focus-visible` da base | patch |
| 17 | `Campo.erro` não é usado nos formulários | false | Login não pode dizer qual campo errou (1.2); o erro fica no parágrafo geral | rejeitado |
| 18 | Sem `loading.tsx`/`error.tsx` no grupo `(app)` | low | Telas provisórias sem dados; cada história liga os seus estados | rejeitado |
| 19 | Comportamento dos componentes sem teste de DOM: Confirmação foca o destrutivo, temporizador e "Desfazer" do provedor, clique engolido, adaptador de teclado (blind, verification-gap) | medium | Vitest roda em `node`, sem jsdom/happy-dom | defer |
| 20 | Toast de 6 s sem pausa em foco ou hover (WCAG 2.2.1) | low | Usuário único, uso por toque; 6 s é decisão do UX | rejeitado |
| 21 | Comentário do toast diz "pílula" mas o raio é `md` | low | Comentário desatualizado | patch |
| 22 | `focus-ring` não medido sobre `nav` (3,03:1) nem sobre `surface` | low | Pares faltando no teste | patch |
| 23 | Teste de tokens compara só cores (raios, espaços e tipografia não) | low | Valores fixos que mudam raramente | rejeitado |
| 24 | `layout.test.tsx` compara HTML exato | low | Frágil, mas cobre a linha da matriz | rejeitado |
| 25 | Painel sem `metadata`; guarda de sessão repetida | low | Título da aba cai no padrão; correção direta (só o título) | patch |
| 26 | Estilos de mensagem de erro diferentes entre telas | low | `codigoMotivo` é informação, não erro | rejeitado |
| 27 | Status da spec e do sprint-status divergem | false | Sincronizado no passo de apresentação | rejeitado |
| 28 | `color-scheme` declarado três vezes | low | Classe arbitrária redundante; remoção direta | patch |
| 29 | `ConfirmarAcao` fecha antes de ação assíncrona terminar | low | Nenhum uso ainda; cada história decide | rejeitado |
| 30 | Item ativo do `NavRail` sem teste | medium | Só as funções puras são testadas; o layout simula o menu | patch |
| 31 | Região `aria-live` do toast sem teste | low | Asserção estática cabe no estilo atual | patch |

## Design Notes

Pares medidos (fg/bg): `text`, `text-muted` sobre `background` e `surface`; `accent-foreground`/`accent`; `accent` sobre `surface` e `background` (pior caso: 4,59 no claro); `nav-label`/`nav`; branco/`nav` (toast, rótulo ativo); branco/`verify` (contador); `danger-fg` sobre `surface` e `danger-bg`; `text`/`alert-warning-bg`; `text`/`selection`; `forecast-*`, os 4 `status-*` e os 8 `person-N-fg/bg`. Com 3:1: `nav-icon-idle`/`nav`, `accent-line`/`surface`, `focus-ring`/`background`, `verify`/`surface`. Medição prévia: todos passam.

Rotas: Painel `/`, Revisar `/revisar`, Receber `/recebimentos`, Previsão `/previsao`, Contas `/contas`, Config. `/configuracoes`.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde.
- `npm run build` -- expected: conclui sem as variáveis do Supabase.

**Manual checks (if no CLI):**
- `next dev` + navegador a 1194 × 834 e a 600 px, nos modos claro e escuro: menu, atalhos, foco e aviso.
